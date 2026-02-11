import { chromium } from 'playwright';
import type { PageInventory, PerformanceResult } from '../ai/types.js';

export async function measurePerformanceAll(
  url: string,
  pages: PageInventory[],
  log: (msg: string) => void
): Promise<PerformanceResult[]> {
  const results: PerformanceResult[] = [];
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    for (const pageInfo of pages.slice(0, 10)) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      try {
        const pageUrl = new URL(pageInfo.path, url).href;
        const startTime = Date.now();
        await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
        const loadTimeMs = Date.now() - startTime;

        const timing = await page.evaluate(() => {
          const entries = performance.getEntriesByType('navigation' as string);
          const perf = entries[0] as any;
          if (!perf) return null;
          return {
            ttfb: Math.round((perf.responseStart || 0) - (perf.requestStart || 0)),
            domContentLoaded: Math.round((perf.domContentLoadedEventEnd || 0) - (perf.fetchStart || 0)),
            loadComplete: Math.round((perf.loadEventEnd || 0) - (perf.fetchStart || 0)),
          };
        });

        let score = 100;
        const ttfb = timing?.ttfb ?? loadTimeMs;
        if (ttfb > 200) score -= Math.min(20, Math.round((ttfb - 200) / 50));
        if (loadTimeMs > 1000) score -= Math.min(30, Math.round((loadTimeMs - 1000) / 100));
        if (timing?.domContentLoaded && timing.domContentLoaded > 1500) {
          score -= Math.min(20, Math.round((timing.domContentLoaded - 1500) / 100));
        }
        score = Math.max(0, Math.min(100, score));

        results.push({ page: pageInfo.path, performance: score, ttfb, loadTimeMs });
        log(`${pageInfo.path}: Score ${score}, TTFB ${ttfb}ms, Load ${loadTimeMs}ms`);
      } catch (err) {
        log(`Performance measurement failed for ${pageInfo.path}: ${(err as Error).message}`);
        results.push({ page: pageInfo.path, performance: 0, ttfb: 0, loadTimeMs: 0 });
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  return results;
}
