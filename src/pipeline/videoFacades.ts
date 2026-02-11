import * as cheerio from 'cheerio';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

export interface VideoFacadeResult {
  html: string;
  facadesApplied: number;
  iframesLazyLoaded?: number;
}

// Detection patterns for video embeds
const VIDEO_PATTERNS = {
  youtube: [
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ],
  vimeo: [
    /player\.vimeo\.com\/video\/(\d+)/,
  ],
  wistia: [
    /fast\.wistia\.net\/embed\/iframe\/([a-zA-Z0-9]+)/,
  ],
};

/** Single script for all video facades — inject once at end of body */
const FACADE_CLICK_SCRIPT = `<script>
(function(){document.querySelectorAll('.mls-video-facade').forEach(function(el){
  el.addEventListener('click',function(){
    var id=el.dataset.videoId,platform=el.dataset.platform,nocookie=el.dataset.nocookie==='true';
    var iframe=document.createElement('iframe');
    iframe.setAttribute('allowfullscreen','');
    iframe.setAttribute('allow','accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture');
    iframe.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;border:0;';
    if(platform==='youtube'){
      var host=nocookie?'www.youtube-nocookie.com':'www.youtube.com';
      iframe.src='https://'+host+'/embed/'+id+'?autoplay=1';
    }else if(platform==='vimeo'){
      iframe.src='https://player.vimeo.com/video/'+id+'?autoplay=1';
    }else if(platform==='wistia'){
      iframe.src='https://fast.wistia.net/embed/iframe/'+id+'?autoplay=true';
    }
    el.innerHTML='';el.style.position='relative';el.appendChild(iframe);
  },{once:true});
});})();
</script>`;

type PosterQuality = 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault';

/**
 * Fetch and optimize a video thumbnail.
 * YouTube: use posterQuality for URL; Vimeo/Wistia: fetch via oembed.
 */
async function fetchThumbnail(
  videoId: string,
  platform: string,
  posterQuality: PosterQuality,
  workDir: string
): Promise<string> {
  let thumbnailUrl: string | null = null;

  try {
    if (platform === 'youtube') {
      thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/${posterQuality}.jpg`;
      // Try maxresdefault first, fallback to hqdefault if 404
      if (posterQuality === 'maxresdefault') {
        const res = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }
    } else if (platform === 'vimeo') {
      const res = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json() as { thumbnail_url?: string };
        thumbnailUrl = data.thumbnail_url ?? null;
      }
    } else if (platform === 'wistia') {
      const res = await fetch(`https://fast.wistia.com/oembed?url=https://home.wistia.com/medias/${videoId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json() as { thumbnail_url?: string };
        thumbnailUrl = data.thumbnail_url ?? null;
      }
    }

    if (!thumbnailUrl) return '';

    const response = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return '';

    const buffer = Buffer.from(await response.arrayBuffer());

    // Optimize with Sharp: resize to 640x360, WebP quality 80
    const optimized = await sharp(buffer)
      .resize(640, 360, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    const thumbDir = path.join(workDir, 'assets', 'video-thumbnails');
    await fs.mkdir(thumbDir, { recursive: true });
    const thumbFilename = `${platform}-${videoId}.webp`;
    await fs.writeFile(path.join(thumbDir, thumbFilename), optimized);
    return `/assets/video-thumbnails/${thumbFilename}`;
  } catch {
    return '';
  }
}

/**
 * Generate facade HTML for a video embed (no inline script — script injected once per page).
 */
function generateFacadeHtml(
  videoId: string,
  platform: string,
  thumbnailPath: string,
  useNocookie: boolean,
  originalWidth?: string,
  originalHeight?: string
): string {
  const width = originalWidth || '100%';
  const height = originalHeight || '100%';
  const nocookieAttr = platform === 'youtube' && useNocookie ? ' data-nocookie="true"' : '';
  const posterSrc = thumbnailPath || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return `<div class="mls-video-facade" data-platform="${platform}" data-video-id="${videoId}"${nocookieAttr} style="position:relative;width:${width};max-width:100%;aspect-ratio:16/9;cursor:pointer;overflow:hidden;background:#000;border-radius:8px;">
  <img src="${posterSrc}" alt="Video thumbnail" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;">
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:68px;height:48px;background:rgba(0,0,0,0.7);border-radius:14px;display:flex;align-items:center;justify-content:center;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
  </div>
</div>`;
}

/**
 * Add loading="lazy" to iframes that don't have it.
 */
function addLazyLoadToIframes($: cheerio.CheerioAPI, enabled: boolean): number {
  if (!enabled) return 0;
  let count = 0;
  $('iframe').each((_, el) => {
    if (!$(el).attr('loading')) {
      $(el).attr('loading', 'lazy');
      count++;
    }
  });
  return count;
}

/**
 * Add preconnect hints for video CDNs when facades are used.
 */
function addPreconnectHints($: cheerio.CheerioAPI, preconnect: boolean, useNocookie: boolean, hasFacades: boolean): void {
  if (!preconnect || !hasFacades) return;
  const head = $('head').first();
  if (!head.length) return;

  const hrefs = ['https://i.ytimg.com'];
  if (useNocookie) {
    hrefs.push('https://www.youtube-nocookie.com');
  } else {
    hrefs.push('https://www.youtube.com');
  }

  for (const href of hrefs) {
    if ($(`link[rel="preconnect"][href="${href}"]`).length === 0) {
      head.append(`<link rel="preconnect" href="${href}" crossorigin>`);
    }
  }
}

/**
 * Detect and replace video embeds with lightweight facades.
 * Wires: posterQuality, useNocookie, preconnect, platforms, lazyLoadIframes.
 */
export async function replaceVideoEmbeds(
  html: string,
  workDir: string,
  settings?: OptimizationSettings
): Promise<VideoFacadeResult> {
  const video = settings?.video;
  if (video?.facadesEnabled === false && !video?.lazyLoadIframes) {
    return { html, facadesApplied: 0, iframesLazyLoaded: 0 };
  }

  const $ = cheerio.load(html);
  let facadesApplied = 0;
  const platformSettings = video?.platforms ?? { youtube: true, vimeo: true, wistia: true };
  const posterQuality = (video?.posterQuality ?? 'sddefault') as PosterQuality;
  const useNocookie = video?.useNocookie ?? true;
  const preconnect = video?.preconnect ?? true;

  const iframes = $('iframe').toArray();

  for (const iframe of iframes) {
    const src = $(iframe).attr('src') || '';
    let platform: string | null = null;
    let videoId: string | null = null;

    for (const [p, patterns] of Object.entries(VIDEO_PATTERNS)) {
      const key = p as keyof typeof platformSettings;
      if (key in platformSettings && !platformSettings[key]) continue;
      for (const pattern of patterns) {
        const match = src.match(pattern);
        if (match) {
          platform = p;
          videoId = match[1];
          break;
        }
      }
      if (platform) break;
    }

    if (!platform || !videoId) continue;

    const thumbnailPath = await fetchThumbnail(videoId, platform, posterQuality, workDir);
    const width = $(iframe).attr('width');
    const height = $(iframe).attr('height');
    const facadeHtml = generateFacadeHtml(videoId, platform, thumbnailPath, useNocookie, width, height);

    $(iframe).replaceWith(facadeHtml);
    facadesApplied++;
  }

  // Lazy load remaining iframes (not replaced by facades)
  const iframesLazyLoaded = addLazyLoadToIframes($, video?.lazyLoadIframes ?? true);

  // Preconnect hints when we have facades
  addPreconnectHints($, preconnect, useNocookie, facadesApplied > 0);

  // Inject single facade script at end of body (only if we added facades)
  if (facadesApplied > 0) {
    const body = $('body').first();
    const hasFacadeScript = $('script')
      .filter((_, el) => (($(el).html() || '').includes('mls-video-facade')))
      .length > 0;
    if (body.length && !hasFacadeScript) {
      body.append(FACADE_CLICK_SCRIPT);
    }
  }

  return {
    html: $.html(),
    facadesApplied,
    iframesLazyLoaded,
  };
}
