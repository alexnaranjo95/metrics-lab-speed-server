import { chromium } from 'playwright';

export interface PerformanceScore {
  performance: number;  // 0-100
  ttfb: number;         // milliseconds
}

/**
 * Measure performance of a URL using Playwright-based metrics.
 * Uses Navigation Timing API and basic performance heuristics.
 *
 * For a more accurate score, integrate with Google PageSpeed Insights API.
 */
export async function measurePerformance(url: string): Promise<PerformanceScore> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    // Navigate and collect timing
    const startTime = Date.now();
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    const loadTime = Date.now() - startTime;

    // Extract Navigation Timing metrics
    const timing = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation' as string);
      const perf = entries[0] as any;
      if (!perf) return null;
      return {
        ttfb: Math.round((perf.responseStart || 0) - (perf.requestStart || 0)),
        domContentLoaded: Math.round((perf.domContentLoadedEventEnd || 0) - (perf.fetchStart || 0)),
        loadComplete: Math.round((perf.loadEventEnd || 0) - (perf.fetchStart || 0)),
        domInteractive: Math.round((perf.domInteractive || 0) - (perf.fetchStart || 0)),
        transferSize: perf.transferSize || 0,
      };
    });

    // Calculate a simple performance score (0-100)
    // This is a simplified heuristic — real Lighthouse uses lab data
    let score = 100;

    const ttfb = timing?.ttfb ?? loadTime;

    // Penalize based on TTFB
    if (ttfb > 200) score -= Math.min(20, Math.round((ttfb - 200) / 50));
    // Penalize based on load time
    if (loadTime > 1000) score -= Math.min(30, Math.round((loadTime - 1000) / 100));
    // Penalize based on DOM content loaded
    if (timing?.domContentLoaded && timing.domContentLoaded > 1500) {
      score -= Math.min(20, Math.round((timing.domContentLoaded - 1500) / 100));
    }

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    await context.close();

    return {
      performance: score,
      ttfb: timing?.ttfb ?? loadTime,
    };
  } finally {
    await browser.close();
  }
}
