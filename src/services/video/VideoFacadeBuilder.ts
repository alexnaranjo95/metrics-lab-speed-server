/**
 * VideoFacadeBuilder — Generates self-contained, LCP-optimized facade HTML.
 *
 * The facade consists of:
 * - A poster image (from CF Images or local) with explicit dimensions
 * - A YouTube-style circular play button with CSS hover + keyboard accessibility
 * - A click handler that injects the video iframe ONLY on user interaction
 * - A loading spinner between click and iframe load
 * - A corresponding <link rel="preload"> tag for the <head>
 */

import type { VideoPlatform } from './VideoSourceResolver.js';

export interface FacadeBuildOptions {
  platform: VideoPlatform;
  videoId: string;
  embedUrl: string;
  thumbnailUrl: string;
  thumbUrl: string;
  actualWidth: number;
  actualHeight: number;
  title?: string;
  aboveTheFold?: boolean;
  containerClass?: string;
  siteId?: string;
  useNocookie?: boolean;
}

export interface FacadeBuildResult {
  facadeHtml: string;
  preloadTag: string;
}

export function buildFacade(options: FacadeBuildOptions): FacadeBuildResult {
  const {
    platform,
    videoId,
    embedUrl,
    thumbnailUrl,
    thumbUrl,
    actualWidth,
    actualHeight,
    title = 'Video',
    aboveTheFold = false,
    containerClass = '',
    siteId = '',
    useNocookie = true,
  } = options;

  const uid = videoId.slice(0, 8);
  const safeTitle = escapeHtml(title);
  const aspectPct = ((actualHeight / actualWidth) * 100).toFixed(2);

  // Resolve the actual embed URL (respect nocookie for YouTube)
  let finalEmbedUrl = embedUrl;
  if (platform === 'youtube' && useNocookie) {
    finalEmbedUrl = embedUrl.replace('www.youtube.com', 'www.youtube-nocookie.com');
  }

  const loadingAttr = aboveTheFold ? 'eager' : 'lazy';
  const decodingAttr = aboveTheFold ? 'sync' : 'async';
  const fetchPriority = aboveTheFold ? 'high' : 'low';

  const facadeHtml = `<div class="ml-video-facade ${containerClass}"
     id="ml-video-${uid}"
     data-embed-url="${escapeAttr(finalEmbedUrl)}"
     data-title="${escapeAttr(safeTitle)}"
     data-site-id="${escapeAttr(siteId)}"
     style="position:relative;width:100%;padding-bottom:${aspectPct}%;background:#000;overflow:hidden;cursor:pointer;">
  <img src="${escapeAttr(thumbnailUrl)}"
       srcset="${escapeAttr(thumbUrl)} 640w, ${escapeAttr(thumbnailUrl)} 1280w"
       sizes="(max-width: 640px) 640px, 1280px"
       width="${actualWidth}"
       height="${actualHeight}"
       alt="${escapeAttr(safeTitle)} — click to play"
       fetchpriority="${fetchPriority}"
       loading="${loadingAttr}"
       decoding="${decodingAttr}"
       style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;"
       class="ml-poster-img">
  <div class="ml-play-btn"
       role="button"
       tabindex="0"
       aria-label="Play video: ${escapeAttr(safeTitle)}"
       style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:72px;height:72px;border-radius:50%;background:rgba(0,0,0,0.75);border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s ease;z-index:10;">
    <svg viewBox="0 0 24 24" width="32" height="32" fill="white" style="margin-left:3px;">
      <path d="M8 5v14l11-7z"/>
    </svg>
  </div>
</div>`;

  const preloadTag = `<link rel="preload"
      href="${escapeAttr(thumbnailUrl)}"
      as="image"
      imagesrcset="${escapeAttr(thumbUrl)} 640w, ${escapeAttr(thumbnailUrl)} 1280w"
      imagesizes="(max-width: 640px) 640px, 1280px"
      fetchpriority="${fetchPriority}">`;

  return { facadeHtml, preloadTag };
}

/**
 * Generates the shared <style> and <script> block that activates ALL facades on the page.
 * Should be injected once at the end of <body>.
 */
export function buildFacadeActivationScript(): string {
  return `<style>
.ml-video-facade:hover .ml-play-btn{transform:translate(-50%,-50%) scale(1.08);background:rgba(220,0,0,0.9);}
.ml-video-facade .ml-play-btn:focus{outline:3px solid #fff;outline-offset:2px;}
@keyframes ml-spin{to{transform:translate(-50%,-50%) rotate(360deg);}}
</style>
<script>
(function(){
  document.querySelectorAll('.ml-video-facade').forEach(function(wrapper){
    function activateVideo(){
      var embedUrl=wrapper.getAttribute('data-embed-url');
      var title=wrapper.getAttribute('data-title')||'Video';
      var playBtn=wrapper.querySelector('.ml-play-btn');
      if(playBtn){
        playBtn.innerHTML='<div style="width:32px;height:32px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;position:absolute;top:50%;left:50%;margin-top:-16px;margin-left:-16px;animation:ml-spin 0.8s linear infinite;"></div>';
      }
      var iframe=document.createElement('iframe');
      iframe.src=embedUrl+(embedUrl.indexOf('?')>-1?'&':'?')+'autoplay=1';
      iframe.allow='accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen';
      iframe.allowFullscreen=true;
      iframe.title=title;
      iframe.loading='eager';
      iframe.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
      iframe.addEventListener('load',function(){if(playBtn)playBtn.remove();});
      var poster=wrapper.querySelector('.ml-poster-img');
      if(poster)poster.remove();
      wrapper.appendChild(iframe);
      wrapper.removeEventListener('click',activateVideo);
      wrapper.removeEventListener('keydown',handleKeydown);
    }
    function handleKeydown(e){
      if(e.key==='Enter'||e.key===' '){e.preventDefault();activateVideo();}
    }
    wrapper.addEventListener('click',activateVideo);
    wrapper.addEventListener('keydown',handleKeydown);
  });
})();
</script>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
