import type { Page, CDPSession } from 'playwright';
import { buildEmitter } from '../events/buildEmitter.js';

export interface ScreencastOptions {
  buildId: string;
  format?: 'jpeg' | 'png';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}

/**
 * Start CDP screencast on a Playwright page and stream frames to buildEmitter.
 *
 * Chrome DevTools Protocol's Page.startScreencast captures compositor frames
 * as base64-encoded images. Each frame fires a Page.screencastFrame event.
 * You MUST call Page.screencastFrameAck with the sessionId after each frame
 * (back-pressure mechanism).
 *
 * Returns a stop function to cleanly end the screencast.
 */
export async function startScreencast(
  page: Page,
  options: ScreencastOptions
): Promise<() => Promise<void>> {
  const {
    buildId,
    format = 'jpeg',
    quality = 45,
    maxWidth = 1280,
    maxHeight = 720,
    everyNthFrame = 4,
  } = options;

  let cdpSession: CDPSession;
  let stopped = false;

  try {
    cdpSession = await page.context().newCDPSession(page);
  } catch (err) {
    console.warn(`[screencast] Failed to create CDP session for build ${buildId}:`, (err as Error).message);
    return async () => {};
  }

  // Handle incoming frames
  cdpSession.on('Page.screencastFrame', async (params: any) => {
    if (stopped) return;

    try {
      const { data, metadata, sessionId } = params;
      const buffer = Buffer.from(data, 'base64');

      // Emit frame to all connected WebSocket clients
      buildEmitter.emitFrame(buildId, buffer, {
        scrollX: metadata?.offsetTop ?? 0,
        scrollY: metadata?.pageScaleFactor ?? 0,
      });

      // ACK the frame — required for Chrome to send the next one
      await cdpSession.send('Page.screencastFrameAck', { sessionId });
    } catch (err) {
      // Non-fatal — frame drop is acceptable
    }
  });

  // Start the screencast
  try {
    await cdpSession.send('Page.startScreencast', {
      format,
      quality,
      maxWidth,
      maxHeight,
      everyNthFrame,
    });
  } catch (err) {
    console.warn(`[screencast] Failed to start screencast for build ${buildId}:`, (err as Error).message);
  }

  // Return a stop function
  return async () => {
    if (stopped) return;
    stopped = true;
    try {
      await cdpSession.send('Page.stopScreencast');
      await cdpSession.detach();
    } catch {
      // Session may already be closed
    }
  };
}

/**
 * Extract element bounding boxes from the page for overlay rendering.
 * Assigns data-ml-id attributes to visible elements and returns their positions.
 */
export async function extractOverlays(page: Page, buildId: string): Promise<void> {
  try {
    const elements = await page.evaluate(() => {
      const results: Array<{
        id: string;
        x: number;
        y: number;
        width: number;
        height: number;
        tag: string;
        selector: string;
      }> = [];

      const interestingTags = ['img', 'video', 'iframe', 'picture', 'script', 'link', 'style'];
      let idx = 0;

      for (const tag of interestingTags) {
        document.querySelectorAll(tag).forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const mlId = `ml-${idx++}`;
          el.setAttribute('data-ml-id', mlId);

          results.push({
            id: mlId,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            tag: el.tagName.toLowerCase(),
            selector: generateSimpleSelector(el),
          });
        });
      }

      function generateSimpleSelector(el: Element): string {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
        return `${tag}${id}${cls}`;
      }

      return results;
    });

    buildEmitter.emitOverlay(buildId, { elements });
  } catch {
    // Non-fatal
  }
}
