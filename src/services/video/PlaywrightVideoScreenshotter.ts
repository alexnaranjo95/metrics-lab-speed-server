/**
 * PlaywrightVideoScreenshotter — Captures a screenshot of a video player
 * at a specified timestamp using headless Chromium via Playwright.
 *
 * Falls back to platform CDN thumbnails or sharp-generated placeholders
 * when screenshot capture fails.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import type { VideoPlatform } from './VideoSourceResolver.js';

const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface ScreenshotOptions {
  videoUrl: string;
  platform: VideoPlatform;
  videoId: string;
  timestampSeconds?: number;
  outputWidth?: number;
  outputHeight?: number;
  waitForPlayerMs?: number;
  timeoutMs?: number;
}

export interface ScreenshotResult {
  screenshotBuffer: Buffer;
  actualWidth: number;
  actualHeight: number;
  capturedAt: string;
  sourceUrl: string;
  isFallback: boolean;
}

const BLOCKED_RESOURCE_PATTERNS = [
  '*doubleclick.net*', '*google-analytics.com*', '*googletagmanager.com*',
  '*facebook.net*', '*facebook.com/tr*', '*hotjar.com*', '*clarity.ms*',
  '*segment.io*', '*amplitude.com*', '*mixpanel.com*', '*sentry.io*',
  '*ads*', '*tracking*', '*analytics*',
];

export async function captureVideoScreenshot(
  options: ScreenshotOptions
): Promise<ScreenshotResult> {
  const {
    videoUrl,
    platform,
    videoId,
    timestampSeconds = 3,
    outputWidth = 1280,
    outputHeight = 720,
    waitForPlayerMs = 4000,
    timeoutMs = 15000,
  } = options;

  try {
    const result = await captureWithPlaywright({
      videoUrl,
      platform,
      videoId,
      timestampSeconds,
      outputWidth,
      outputHeight,
      waitForPlayerMs,
      timeoutMs,
    });
    return result;
  } catch (err) {
    console.warn(
      `[video-screenshot] Playwright capture failed for ${platform}/${videoId}: ${(err as Error).message}. Using fallback.`
    );
    return getFallbackThumbnail(platform, videoId, videoUrl, outputWidth, outputHeight);
  }
}

async function captureWithPlaywright(opts: {
  videoUrl: string;
  platform: VideoPlatform;
  videoId: string;
  timestampSeconds: number;
  outputWidth: number;
  outputHeight: number;
  waitForPlayerMs: number;
  timeoutMs: number;
}): Promise<ScreenshotResult> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--autoplay-policy=no-user-gesture-required',
      '--ignore-certificate-errors',
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: CHROME_UA,
      viewport: { width: opts.outputWidth, height: opts.outputHeight },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    // Block non-essential requests to speed up page load
    await page.route('**/*', (route) => {
      const url = route.request().url();
      const isBlocked = BLOCKED_RESOURCE_PATTERNS.some((pattern) => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
        return regex.test(url);
      });
      if (isBlocked) return route.abort();
      return route.continue();
    });

    page.setDefaultTimeout(opts.timeoutMs);

    let screenshotBuffer: Buffer;

    if (opts.platform === 'directVideo' || opts.platform === 'wordpress') {
      screenshotBuffer = await captureDirectVideo(page, opts.videoUrl, opts.timestampSeconds);
    } else if (opts.platform === 'youtube') {
      screenshotBuffer = await captureYouTube(page, opts.videoId, opts.timestampSeconds, opts.waitForPlayerMs);
    } else if (opts.platform === 'vimeo') {
      screenshotBuffer = await captureVimeo(page, opts.videoId, opts.timestampSeconds, opts.waitForPlayerMs);
    } else {
      screenshotBuffer = await captureGenericEmbed(page, opts.videoUrl, opts.timestampSeconds, opts.waitForPlayerMs);
    }

    await context.close();

    const metadata = await sharp(screenshotBuffer).metadata();

    return {
      screenshotBuffer,
      actualWidth: metadata.width ?? opts.outputWidth,
      actualHeight: metadata.height ?? opts.outputHeight,
      capturedAt: new Date().toISOString(),
      sourceUrl: opts.videoUrl,
      isFallback: false,
    };
  } finally {
    await browser.close();
  }
}

async function captureDirectVideo(
  page: any,
  videoUrl: string,
  timestampSeconds: number
): Promise<Buffer> {
  const content = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#000;">
<video src="${videoUrl}" style="width:100vw;height:100vh;object-fit:contain;"
       preload="auto" crossorigin="anonymous"></video>
</body></html>`;

  await page.setContent(content);
  await page.waitForFunction(
    () => {
      const v = document.querySelector('video');
      return v && v.readyState >= 2;
    },
    { timeout: 15000 }
  );

  await page.evaluate((ts: number) => {
    const v = document.querySelector('video')!;
    v.currentTime = ts;
  }, timestampSeconds);
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const v = document.querySelector('video')!;
    v.pause();
  });

  const videoEl = await page.$('video');
  if (!videoEl) throw new Error('Video element not found');
  const box = await videoEl.boundingBox();
  if (!box) throw new Error('Video element has no bounding box');

  return page.screenshot({ clip: box, type: 'png' }) as Promise<Buffer>;
}

async function captureYouTube(
  page: any,
  videoId: string,
  timestampSeconds: number,
  waitForPlayerMs: number
): Promise<Buffer> {
  await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
    waitUntil: 'domcontentloaded',
  });

  await page.waitForSelector('video.html5-main-video', { timeout: waitForPlayerMs + 5000 });

  // Dismiss any consent/cookie overlays
  try {
    const consentBtn = await page.$('button[aria-label*="Accept"], button[aria-label*="agree"], tp-yt-paper-dialog button');
    if (consentBtn) await consentBtn.click();
  } catch { /* no consent dialog */ }

  // Try clicking play if not autoplaying
  try {
    const playBtn = await page.$('button.ytp-play-button');
    if (playBtn) await playBtn.click();
  } catch { /* may already be playing */ }

  // Wait for video to start
  await page.waitForFunction(
    () => {
      const v = document.querySelector('video.html5-main-video') as HTMLVideoElement;
      return v && v.currentTime > 0;
    },
    { timeout: waitForPlayerMs }
  ).catch(() => { /* proceed even if video hasn't started */ });

  // Seek to target timestamp
  await page.evaluate((ts: number) => {
    const v = document.querySelector('video.html5-main-video') as HTMLVideoElement;
    if (v) v.currentTime = ts;
  }, timestampSeconds);
  await page.waitForTimeout(800);

  // Pause
  await page.evaluate(() => {
    const v = document.querySelector('video.html5-main-video') as HTMLVideoElement;
    if (v) v.pause();
  });

  // Screenshot just the video bounding box
  const videoEl = await page.$('video.html5-main-video');
  if (!videoEl) throw new Error('YouTube video element not found');
  const box = await videoEl.boundingBox();
  if (!box) throw new Error('YouTube video has no bounding box');

  return page.screenshot({ clip: box, type: 'png' }) as Promise<Buffer>;
}

async function captureVimeo(
  page: any,
  videoId: string,
  timestampSeconds: number,
  waitForPlayerMs: number
): Promise<Buffer> {
  await page.goto(`https://vimeo.com/${videoId}`, {
    waitUntil: 'domcontentloaded',
  });

  await page.waitForSelector('video', { timeout: waitForPlayerMs + 5000 });

  // Click play if needed
  try {
    const playBtn = await page.$('.vp-controls .play, button[aria-label*="Play"]');
    if (playBtn) await playBtn.click();
  } catch { /* may already play */ }

  await page.waitForFunction(
    () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      return v && v.currentTime > 0;
    },
    { timeout: waitForPlayerMs }
  ).catch(() => {});

  await page.evaluate((ts: number) => {
    const v = document.querySelector('video') as HTMLVideoElement;
    if (v) v.currentTime = ts;
  }, timestampSeconds);
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const v = document.querySelector('video') as HTMLVideoElement;
    if (v) v.pause();
  });

  const videoEl = await page.$('video');
  if (!videoEl) throw new Error('Vimeo video element not found');
  const box = await videoEl.boundingBox();
  if (!box) throw new Error('Vimeo video has no bounding box');

  return page.screenshot({ clip: box, type: 'png' }) as Promise<Buffer>;
}

async function captureGenericEmbed(
  page: any,
  embedUrl: string,
  timestampSeconds: number,
  waitForPlayerMs: number
): Promise<Buffer> {
  await page.goto(embedUrl, { waitUntil: 'domcontentloaded' });

  await page.waitForSelector('video', { timeout: waitForPlayerMs + 5000 });

  // Try clicking any play button
  try {
    const playBtn = await page.$('button[aria-label*="Play"], button[aria-label*="play"], .play-button, [class*="play"]');
    if (playBtn) await playBtn.click();
  } catch { /* ignore */ }

  await page.waitForFunction(
    () => {
      const v = document.querySelector('video') as HTMLVideoElement;
      return v && v.readyState >= 2;
    },
    { timeout: waitForPlayerMs }
  ).catch(() => {});

  await page.evaluate((ts: number) => {
    const v = document.querySelector('video') as HTMLVideoElement;
    if (v) {
      v.currentTime = ts;
      v.pause();
    }
  }, timestampSeconds);
  await page.waitForTimeout(800);

  const videoEl = await page.$('video');
  if (!videoEl) throw new Error('Video element not found on page');
  const box = await videoEl.boundingBox();
  if (!box) throw new Error('Video element has no bounding box');

  return page.screenshot({ clip: box, type: 'png' }) as Promise<Buffer>;
}

/**
 * Fallback: try platform CDN thumbnail, then generate placeholder with sharp.
 */
async function getFallbackThumbnail(
  platform: VideoPlatform,
  videoId: string,
  videoUrl: string,
  width: number,
  height: number
): Promise<ScreenshotResult> {
  // YouTube CDN fallback
  if (platform === 'youtube') {
    for (const quality of ['maxresdefault', 'hqdefault', 'sddefault'] as const) {
      try {
        const url = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(buffer).metadata();
        // maxresdefault returns a 120x90 placeholder if the image doesn't exist
        if (meta.width && meta.width > 200) {
          return {
            screenshotBuffer: buffer,
            actualWidth: meta.width ?? width,
            actualHeight: meta.height ?? height,
            capturedAt: new Date().toISOString(),
            sourceUrl: videoUrl,
            isFallback: true,
          };
        }
      } catch { continue; }
    }
  }

  // Vimeo oEmbed fallback
  if (platform === 'vimeo') {
    try {
      const res = await fetch(
        `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const data = (await res.json()) as { thumbnail_url?: string };
        if (data.thumbnail_url) {
          const imgRes = await fetch(data.thumbnail_url, { signal: AbortSignal.timeout(8000) });
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const meta = await sharp(buffer).metadata();
            return {
              screenshotBuffer: buffer,
              actualWidth: meta.width ?? width,
              actualHeight: meta.height ?? height,
              capturedAt: new Date().toISOString(),
              sourceUrl: videoUrl,
              isFallback: true,
            };
          }
        }
      }
    } catch { /* proceed to generated placeholder */ }
  }

  // Generated placeholder with sharp
  return generatePlaceholder(platform, width, height, videoUrl);
}

async function generatePlaceholder(
  platform: VideoPlatform,
  width: number,
  height: number,
  videoUrl: string
): Promise<ScreenshotResult> {
  const label = platform.charAt(0).toUpperCase() + platform.slice(1);
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#1a1a2e"/>
    <text x="50%" y="45%" text-anchor="middle" fill="#888" font-family="Arial,sans-serif" font-size="28">${label} Video</text>
    <polygon points="${width / 2 - 20},${height / 2 + 20} ${width / 2 - 20},${height / 2 + 70} ${width / 2 + 25},${height / 2 + 45}" fill="#ccc"/>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();

  return {
    screenshotBuffer: buffer,
    actualWidth: width,
    actualHeight: height,
    capturedAt: new Date().toISOString(),
    sourceUrl: videoUrl,
    isFallback: true,
  };
}
