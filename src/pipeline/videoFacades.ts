import * as cheerio from 'cheerio';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export interface VideoFacadeResult {
  html: string;
  facadesApplied: number;
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

/**
 * Fetch and optimize a video thumbnail.
 */
async function fetchThumbnail(videoId: string, platform: string): Promise<Buffer | null> {
  let thumbnailUrl: string | null = null;

  try {
    if (platform === 'youtube') {
      // Try WebP first, fallback to JPEG
      thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;
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

    if (!thumbnailUrl) return null;

    const response = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    // Optimize with Sharp: resize to 640x360, WebP quality 80
    const optimized = await sharp(buffer)
      .resize(640, 360, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    return optimized;
  } catch {
    return null;
  }
}

/**
 * Generate facade HTML for a video embed.
 */
function generateFacadeHtml(
  videoId: string,
  platform: string,
  thumbnailPath: string,
  originalSrc: string,
  originalWidth?: string,
  originalHeight?: string
): string {
  const width = originalWidth || '100%';
  const height = originalHeight || '100%';

  return `
<div class="mls-video-facade" data-platform="${platform}" data-video-id="${videoId}" data-original-src="${originalSrc}" style="position:relative;width:${width};max-width:100%;aspect-ratio:16/9;cursor:pointer;overflow:hidden;background:#000;border-radius:8px;">
  <picture>
    <img src="${thumbnailPath}" alt="Video thumbnail" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;">
  </picture>
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:68px;height:48px;background:rgba(0,0,0,0.7);border-radius:14px;display:flex;align-items:center;justify-content:center;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
  </div>
</div>
<script>
document.querySelectorAll('.mls-video-facade[data-video-id="${videoId}"]').forEach(function(el) {
  el.addEventListener('click', function() {
    var src = el.getAttribute('data-original-src');
    var sep = src.indexOf('?') !== -1 ? '&' : '?';
    var iframe = document.createElement('iframe');
    iframe.src = src + sep + 'autoplay=1';
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:0;';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    el.innerHTML = '';
    el.style.position = 'relative';
    el.appendChild(iframe);
  }, { once: true });
});
</script>`.trim();
}

/**
 * Detect and replace video embeds with lightweight facades.
 */
export async function replaceVideoEmbeds(
  html: string,
  workDir: string
): Promise<VideoFacadeResult> {
  const $ = cheerio.load(html);
  let facadesApplied = 0;

  const iframes = $('iframe').toArray();

  for (const iframe of iframes) {
    const src = $(iframe).attr('src') || '';
    let platform: string | null = null;
    let videoId: string | null = null;

    // Try to match against known video platforms
    for (const [p, patterns] of Object.entries(VIDEO_PATTERNS)) {
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

    // Fetch and save thumbnail
    const thumbnail = await fetchThumbnail(videoId, platform);
    let thumbnailPath = '';

    if (thumbnail) {
      const thumbDir = path.join(workDir, 'assets', 'video-thumbnails');
      await fs.mkdir(thumbDir, { recursive: true });
      const thumbFilename = `${platform}-${videoId}.webp`;
      await fs.writeFile(path.join(thumbDir, thumbFilename), thumbnail);
      thumbnailPath = `/assets/video-thumbnails/${thumbFilename}`;
    }

    const width = $(iframe).attr('width');
    const height = $(iframe).attr('height');
    const facadeHtml = generateFacadeHtml(videoId, platform, thumbnailPath, src, width, height);

    $(iframe).replaceWith(facadeHtml);
    facadesApplied++;
  }

  return {
    html: $.html(),
    facadesApplied,
  };
}
