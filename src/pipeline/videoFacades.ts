/**
 * Video Facade Pipeline v3
 *
 * Detects video embeds across 12 platforms, classifies them as background
 * or click-to-play, captures Playwright screenshots, and routes to the
 * appropriate builder:
 *   - Background videos -> VideoBackgroundBuilder (native <video> + HLS)
 *   - Click-to-play videos -> VideoFacadeBuilder (poster + iframe on click)
 *
 * Also scans <video> elements (not just iframes) for background detection.
 */

import * as cheerio from 'cheerio';
import type { OptimizationSettings } from '../shared/settingsSchema.js';
import { resolveVideoSource, type VideoPlatform } from '../services/video/VideoSourceResolver.js';
import { classifyVideoType } from '../services/video/VideoTypeClassifier.js';
import { captureVideoScreenshot } from '../services/video/PlaywrightVideoScreenshotter.js';
import { uploadThumbnail } from '../services/video/CloudflareImageUploader.js';
import { buildFacade, buildFacadeActivationScript } from '../services/video/VideoFacadeBuilder.js';
import { buildBackgroundVideo } from '../services/video/VideoBackgroundBuilder.js';
import { uploadFromUrl, isStreamAvailable, waitForReady } from '../services/video/CloudflareStreamUploader.js';
import { downloadVideo, cleanupDownload } from '../services/video/VideoDownloader.js';
import { uploadToR2, deleteFromR2, isR2Available } from '../services/video/R2StagingUploader.js';
import { config } from '../config.js';

export interface VideoFacadeResult {
  html: string;
  facadesApplied: number;
  backgroundVideos: number;
  iframesLazyLoaded?: number;
}

function isPlatformEnabled(platform: VideoPlatform, platformSettings: Record<string, boolean>): boolean {
  const mapping: Record<VideoPlatform, string> = {
    youtube: 'youtube', vimeo: 'vimeo', wistia: 'wistia',
    loom: 'loom', bunny: 'bunny', mux: 'mux',
    dailymotion: 'dailymotion', streamable: 'streamable', twitch: 'twitch',
    directVideo: 'directMp4', wordpress: 'directMp4',
  };
  return platformSettings[mapping[platform] ?? platform] !== false;
}

function isAboveTheFold($: cheerio.CheerioAPI, el: any, index: number): boolean {
  if (index === 0) return true;
  return $(el).closest('header, .hero, [class*="hero"], .banner, [class*="banner"]').length > 0;
}

/**
 * Detect and replace video embeds with optimized components.
 * Routes background videos to System A and click-to-play to System B.
 */
export async function replaceVideoEmbeds(
  html: string,
  workDir: string,
  settings?: OptimizationSettings
): Promise<VideoFacadeResult> {
  const video = settings?.video;
  if (video?.facadesEnabled === false && !video?.lazyLoadIframes) {
    return { html, facadesApplied: 0, backgroundVideos: 0, iframesLazyLoaded: 0 };
  }

  const $ = cheerio.load(html);
  let facadesApplied = 0;
  let backgroundVideos = 0;
  const preloadTags: string[] = [];
  const bgPreloadTags: string[] = [];
  const platformSettings = (video?.platforms ?? { youtube: true, vimeo: true, wistia: true }) as Record<string, boolean>;
  const useNocookie = video?.useNocookie ?? true;
  const screenshotTimestamp = (video as any)?.screenshotTimestamp ?? 3;
  const bgScreenshotTimestamp = (video as any)?.screenshotTimestampBg ?? 2;
  const useCfImages = (video as any)?.useCfImages ?? true;
  const useCfStream = (video as any)?.useCfStream ?? true;
  const aboveTheFoldDetection = (video as any)?.aboveTheFoldDetection ?? true;
  const youtubeParams = (video as any)?.youtubeParams ?? '';

  let videoIndex = 0;

  // ── Process <iframe> elements ──
  const iframes = $('iframe').toArray();
  for (const iframe of iframes) {
    const src = $(iframe).attr('src') || '';
    if (!src) continue;

    const resolved = resolveVideoSource(src);
    if (!resolved) continue;
    if (!isPlatformEnabled(resolved.platform, platformSettings)) continue;

    const classification = classifyVideoType($, iframe as any);
    console.log(
      `[video-facade] Classified ${resolved.platform}/${resolved.videoId}: ` +
      `${classification.type} (confidence: ${classification.confidence.toFixed(2)}, ` +
      `signals: ${classification.signals.join('; ')})`
    );

    try {
      const aboveTheFold = aboveTheFoldDetection && isAboveTheFold($, iframe, videoIndex);

      if (classification.type === 'background' && useCfStream && isStreamAvailable()) {
        // ── System A: Background video ──
        const result = await processBackgroundVideo($, iframe, resolved, aboveTheFold, bgScreenshotTimestamp, useCfImages, workDir);
        if (result) {
          bgPreloadTags.push(result.preloadTag);
          backgroundVideos++;
          videoIndex++;
        }
      } else {
        // ── System B: Click-to-play facade ──
        await processClickToPlayVideo($, iframe, resolved, aboveTheFold, screenshotTimestamp, useCfImages, useNocookie, youtubeParams, workDir, preloadTags);
        facadesApplied++;
        videoIndex++;
      }
    } catch (err) {
      console.error(`[video-facade] Failed ${resolved.platform}/${resolved.videoId}: ${(err as Error).message}`);
      if (!$(iframe).attr('loading')) $(iframe).attr('loading', 'lazy');
    }
  }

  // ── Process <video> elements (background video detection) ──
  const videoElements = $('video').toArray();
  for (const videoEl of videoElements) {
    const classification = classifyVideoType($, videoEl as any);

    if (classification.type !== 'background') continue;
    if (!useCfStream || !isStreamAvailable()) continue;

    const src = $(videoEl).find('source').first().attr('src') ||
                $(videoEl).attr('src') || '';
    if (!src) continue;

    const resolved = resolveVideoSource(src);
    if (!resolved) continue;

    console.log(
      `[video-facade] Found background <video>: ${resolved.platform}/${resolved.videoId} ` +
      `(signals: ${classification.signals.join('; ')})`
    );

    try {
      const aboveTheFold = aboveTheFoldDetection && isAboveTheFold($, videoEl, videoIndex);
      const result = await processBackgroundVideo($, videoEl, resolved, aboveTheFold, bgScreenshotTimestamp, useCfImages, workDir);
      if (result) {
        bgPreloadTags.push(result.preloadTag);
        backgroundVideos++;
        videoIndex++;
      }
    } catch (err) {
      console.error(`[video-facade] Failed bg video ${resolved.platform}/${resolved.videoId}: ${(err as Error).message}`);
    }
  }

  // ── Lazy-load remaining iframes ──
  let iframesLazyLoaded = 0;
  if (video?.lazyLoadIframes !== false) {
    $('iframe').each((_, el) => {
      if (!$(el).attr('loading')) {
        $(el).attr('loading', 'lazy');
        iframesLazyLoaded++;
      }
    });
  }

  // ── Inject preloads: background video first, then click-to-play ──
  const head = $('head').first();
  if (head.length) {
    const allPreloads = [...bgPreloadTags, ...preloadTags];
    if (allPreloads.length > 0) {
      head.prepend(allPreloads.join('\n'));
    }
  }

  // ── Inject facade activation script ──
  if (facadesApplied > 0) {
    const body = $('body').first();
    const hasScript = $('script').filter((_, el) => (($(el).html() || '').includes('ml-video-facade'))).length > 0;
    if (body.length && !hasScript) {
      body.append(buildFacadeActivationScript());
    }
  }

  return {
    html: $.html(),
    facadesApplied,
    backgroundVideos,
    iframesLazyLoaded,
  };
}

/**
 * Process a background video: upload to CF Stream, capture screenshot,
 * build native <video> component with HLS.
 */
async function processBackgroundVideo(
  $: cheerio.CheerioAPI,
  el: any,
  resolved: ReturnType<typeof resolveVideoSource> & {},
  aboveTheFold: boolean,
  timestampSeconds: number,
  useCfImages: boolean,
  workDir: string
): Promise<{ preloadTag: string } | null> {
  let streamResult;

  if (resolved.requiresDownload) {
    // Download -> R2 staging -> CF Stream
    if (!isR2Available()) {
      console.warn(`[video-facade] R2 not configured, skipping bg video download for ${resolved.platform}/${resolved.videoId}`);
      return null;
    }
    const download = await downloadVideo(resolved.screenshotUrl, resolved.videoId, resolved.platform);
    try {
      const r2Key = `staging/${resolved.platform}-${resolved.videoId}.${download.format}`;
      const r2 = await uploadToR2(download.filePath, r2Key);
      streamResult = await uploadFromUrl(r2.presignedUrl, {
        name: `${resolved.platform}-${resolved.videoId}`,
        platform: resolved.platform,
      });
      // Clean up R2 staging file after Stream ingests it (async, non-blocking)
      waitForReady(streamResult.uid, 120000).then(() => deleteFromR2(r2Key)).catch(() => {});
    } finally {
      await cleanupDownload(download.filePath);
    }
  } else {
    // Direct URL copy to CF Stream
    streamResult = await uploadFromUrl(resolved.screenshotUrl, {
      name: `${resolved.platform}-${resolved.videoId}`,
      platform: resolved.platform,
    });
  }

  // Capture Playwright screenshot for placeholder
  const screenshot = await captureVideoScreenshot({
    videoUrl: resolved.screenshotUrl,
    platform: resolved.platform,
    videoId: resolved.videoId,
    timestampSeconds,
  });

  // Upload placeholder to CF Images (both desktop and mobile variants)
  const imageId = `ml-bg-${resolved.videoId}`;
  const uploaded = await uploadThumbnail(
    screenshot.screenshotBuffer,
    imageId,
    { sourceUrl: resolved.screenshotUrl, capturedAt: screenshot.capturedAt },
    workDir
  );

  // Get container CSS from parent element
  const $el = $(el);
  const parent = $el.parent();
  const containerClasses = parent.attr('class') || $el.attr('class') || '';
  const containerStyles = parent.attr('style') || '';

  const { backgroundHtml, preloadTag } = buildBackgroundVideo({
    streamUid: streamResult.uid,
    hlsUrl: streamResult.hlsUrl,
    mp4FallbackUrl: streamResult.mp4Url,
    thumbnailDesktopUrl: uploaded.publicUrl,
    thumbnailMobileUrl: uploaded.thumbUrl,
    actualWidth: screenshot.actualWidth,
    actualHeight: screenshot.actualHeight,
    originalContainerClasses: containerClasses,
    originalContainerStyles: containerStyles,
    mobileBreakpoint: (config as any).BACKGROUND_VIDEO_MOBILE_BREAKPOINT || 768,
  });

  // Replace the element with the background video component
  if (parent.children().length === 1) {
    // Replace entire parent if it only contains the video
    parent.replaceWith(backgroundHtml);
  } else {
    $el.replaceWith(backgroundHtml);
  }

  console.log(
    `[video-facade] Background video: ${resolved.platform}/${resolved.videoId} -> ` +
    `CF Stream ${streamResult.uid} (${streamResult.readyToStream ? 'ready' : 'processing'})`
  );

  return { preloadTag };
}

/**
 * Process a click-to-play video: screenshot + facade.
 */
async function processClickToPlayVideo(
  $: cheerio.CheerioAPI,
  el: any,
  resolved: ReturnType<typeof resolveVideoSource> & {},
  aboveTheFold: boolean,
  timestampSeconds: number,
  useCfImages: boolean,
  useNocookie: boolean,
  youtubeParams: string,
  workDir: string,
  preloadTags: string[]
): Promise<void> {
  let embedUrl = resolved.embedUrl;
  if (resolved.platform === 'youtube' && youtubeParams.trim()) {
    const sep = embedUrl.includes('?') ? '&' : '?';
    embedUrl = `${embedUrl}${sep}${youtubeParams.trim()}`;
  }

  const screenshot = await captureVideoScreenshot({
    videoUrl: resolved.screenshotUrl,
    platform: resolved.platform,
    videoId: resolved.videoId,
    timestampSeconds,
  });

  const imageId = `ml-video-thumb-${resolved.platform}-${resolved.videoId}`;
  const uploaded = await uploadThumbnail(
    screenshot.screenshotBuffer,
    imageId,
    { sourceUrl: resolved.screenshotUrl, capturedAt: screenshot.capturedAt },
    workDir
  );

  const { facadeHtml, preloadTag } = buildFacade({
    platform: resolved.platform,
    videoId: resolved.videoId,
    embedUrl,
    thumbnailUrl: uploaded.publicUrl,
    thumbUrl: uploaded.thumbUrl,
    actualWidth: screenshot.actualWidth,
    actualHeight: screenshot.actualHeight,
    title: resolved.title || `${resolved.platform} video`,
    aboveTheFold,
    useNocookie,
  });

  $(el).replaceWith(facadeHtml);
  preloadTags.push(preloadTag);

  console.log(
    `[video-facade] Click-to-play: ${resolved.platform}/${resolved.videoId} ` +
    `(${screenshot.actualWidth}x${screenshot.actualHeight}, ` +
    `${screenshot.isFallback ? 'fallback' : 'screenshot'}, ` +
    `${uploaded.isLocal ? 'local' : 'CF Images'})`
  );
}
