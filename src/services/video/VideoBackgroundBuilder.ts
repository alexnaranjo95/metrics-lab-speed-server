/**
 * VideoBackgroundBuilder — Generates the full background video HTML structure.
 *
 * Background videos use native <video> with CF Stream HLS source.
 * A Playwright screenshot serves as the placeholder image — LCP-critical.
 * On mobile (<768px): video is hidden, only static placeholder shown.
 * hls.js loaded dynamically via IntersectionObserver for Chrome/Firefox.
 * Placeholder fades out with CSS transition when video canplay fires.
 */

import { config } from '../../config.js';

export interface BackgroundBuildOptions {
  streamUid: string;
  hlsUrl: string;
  mp4FallbackUrl: string;
  thumbnailDesktopUrl: string;
  thumbnailMobileUrl: string;
  actualWidth: number;
  actualHeight: number;
  originalContainerClasses: string;
  originalContainerStyles: string;
  mobileBreakpoint?: number;
}

export interface BackgroundBuildResult {
  backgroundHtml: string;
  preloadTag: string;
}

export function buildBackgroundVideo(options: BackgroundBuildOptions): BackgroundBuildResult {
  const {
    streamUid,
    hlsUrl,
    mp4FallbackUrl,
    thumbnailDesktopUrl,
    thumbnailMobileUrl,
    actualWidth,
    actualHeight,
    originalContainerClasses,
    originalContainerStyles,
    mobileBreakpoint = 768,
  } = options;

  const uid = streamUid.slice(0, 8);
  const subdomain = (config as any).CF_STREAM_CUSTOMER_SUBDOMAIN || '';
  const preconnectDomain = subdomain
    ? `https://customer-${subdomain}.cloudflarestream.com`
    : '';

  const backgroundHtml = `<div class="ml-bg-wrapper-${uid} ${esc(originalContainerClasses)}"
     id="ml-bg-${uid}"
     data-stream-uid="${esc(streamUid)}"
     data-hls-url="${esc(hlsUrl)}"
     style="${esc(originalContainerStyles)}position:relative;overflow:hidden;">

  <img class="ml-bg-placeholder-${uid}"
       src="${esc(thumbnailDesktopUrl)}"
       srcset="${esc(thumbnailMobileUrl)} ${mobileBreakpoint}w, ${esc(thumbnailDesktopUrl)} 1920w"
       sizes="(max-width: ${mobileBreakpoint}px) ${mobileBreakpoint}px, 1920px"
       width="${actualWidth}"
       height="${actualHeight}"
       alt=""
       role="presentation"
       fetchpriority="high"
       loading="eager"
       decoding="sync"
       style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:0;transition:opacity 0.8s ease;pointer-events:none;">

  <video class="ml-bg-video-${uid}"
         autoplay muted loop playsinline
         preload="none"
         style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;display:block;"
         aria-hidden="true">
    <source src="${esc(hlsUrl)}" type="application/vnd.apple.mpegurl">
    <source src="${esc(mp4FallbackUrl)}" type="video/mp4">
  </video>

</div>

<style>
  @media (max-width: ${mobileBreakpoint - 1}px) {
    .ml-bg-video-${uid} { display: none !important; }
    .ml-bg-placeholder-${uid} { opacity: 1 !important; }
  }
  .ml-bg-fade-out-${uid} { opacity: 0 !important; }
</style>
<script>
(function() {
  var wrapper = document.getElementById('ml-bg-${uid}');
  if (!wrapper) return;

  var video = wrapper.querySelector('.ml-bg-video-${uid}');
  var placeholder = wrapper.querySelector('.ml-bg-placeholder-${uid}');
  if (!video || !placeholder) return;

  if (window.innerWidth < ${mobileBreakpoint}) return;

  function attachHls() {
    var hlsUrl = wrapper.getAttribute('data-hls-url');
    var canPlayHls = video.canPlayType('application/vnd.apple.mpegurl');

    if (canPlayHls) {
      video.play().catch(function() {});
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';
    script.onload = function() {
      if (!window.Hls || !Hls.isSupported()) return;
      var hls = new Hls({
        startLevel: 0,
        autoStartLoad: true,
        enableWorker: true
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function() {
        video.play().catch(function() {});
      });
    };
    document.head.appendChild(script);
  }

  video.addEventListener('canplay', function() {
    placeholder.classList.add('ml-bg-fade-out-${uid}');
    setTimeout(function() {
      placeholder.style.display = 'none';
    }, 800);
  }, { once: true });

  if (window.IntersectionObserver) {
    var observer = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        attachHls();
      }
    }, { rootMargin: '200px' });
    observer.observe(wrapper);
  } else {
    attachHls();
  }
})();
</script>`;

  const preloadTag = `<link rel="preload"
      href="${esc(thumbnailDesktopUrl)}"
      as="image"
      media="(min-width: ${mobileBreakpoint}px)"
      imagesrcset="${esc(thumbnailMobileUrl)} ${mobileBreakpoint}w, ${esc(thumbnailDesktopUrl)} 1920w"
      imagesizes="(max-width: ${mobileBreakpoint}px) ${mobileBreakpoint}px, 1920px"
      fetchpriority="high">`;

  return { backgroundHtml, preloadTag };
}

function esc(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
