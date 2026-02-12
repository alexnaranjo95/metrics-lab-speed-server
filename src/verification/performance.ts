import { chromium } from 'playwright';
import type { PageInventory, PerformanceResult } from '../ai/types.js';
import { measureWithPageSpeed, isPageSpeedAvailable } from '../services/pagespeed.js';

/**
 * Measure performance for a list of pages.
 * Prefers PageSpeed Insights API (mobile strategy) when available;
 * falls back to the Playwright heuristic when PSI key is missing or a URL
 * isn't publicly reachable.
 */
export async function measurePerformanceAll(
  url: string,
  pages: PageInventory[],
  log: (msg: string) => void
): Promise<PerformanceResult[]> {
  const usePsi = isPageSpeedAvailable();

  if (usePsi) {
    log(`Using PageSpeed Insights API for measurement (mobile strategy)`);
    return measureWithPsi(url, pages, log);
  }

  log(`PAGESPEED_API_KEY not set — using Playwright heuristic`);
  return measureWithPlaywrightFallback(url, pages, log);
}

// ─── PSI-based measurement ────────────────────────────────────────

async function measureWithPsi(
  baseUrl: string,
  pages: PageInventory[],
  log: (msg: string) => void
): Promise<PerformanceResult[]> {
  const results: PerformanceResult[] = [];

  // Measure up to 10 pages sequentially (PSI has rate limits: 400/100s)
  for (const pageInfo of pages.slice(0, 10)) {
    try {
      const pageUrl = new URL(pageInfo.path, baseUrl).href;
      const psi = await measureWithPageSpeed(pageUrl, 'mobile');

      const fmtScore =
        `Score ${psi.performance}, LCP ${(psi.lcp / 1000).toFixed(1)}s, ` +
        `TBT ${Math.round(psi.tbt)}ms, CLS ${psi.cls}, ` +
        `FCP ${(psi.fcp / 1000).toFixed(1)}s, SI ${(psi.si / 1000).toFixed(1)}s`;

      log(`${pageInfo.path}: ${fmtScore}`);

      results.push({
        page: pageInfo.path,
        performance: psi.performance,
        ttfb: psi.ttfb,
        loadTimeMs: psi.lcp, // LCP is the most meaningful "load time" metric
      });
    } catch (err) {
      log(`PSI failed for ${pageInfo.path}: ${(err as Error).message} — trying Playwright`);
      // Fall back to Playwright for this individual page
      const fallback = await measureSinglePagePlaywright(baseUrl, pageInfo.path, log);
      results.push(fallback);
    }
  }

  return results;
}

// ─── Playwright-based fallback ────────────────────────────────────

async function measureWithPlaywrightFallback(
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
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
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

// ─── Single-page Playwright fallback (for individual PSI failures) ─

async function measureSinglePagePlaywright(
  baseUrl: string,
  pagePath: string,
  log: (msg: string) => void
): Promise<PerformanceResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageUrl = new URL(pagePath, baseUrl).href;
    const startTime = Date.now();
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    const loadTimeMs = Date.now() - startTime;

    const timing = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation' as string);
      const perf = entries[0] as any;
      if (!perf) return null;
      return {
        ttfb: Math.round((perf.responseStart || 0) - (perf.requestStart || 0)),
        domContentLoaded: Math.round((perf.domContentLoadedEventEnd || 0) - (perf.fetchStart || 0)),
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

    log(`${pagePath} (Playwright fallback): Score ${score}, TTFB ${ttfb}ms, Load ${loadTimeMs}ms`);
    await context.close();
    return { page: pagePath, performance: score, ttfb, loadTimeMs };
  } catch (err) {
    log(`Playwright fallback failed for ${pagePath}: ${(err as Error).message}`);
    return { page: pagePath, performance: 0, ttfb: 0, loadTimeMs: 0 };
  } finally {
    await browser.close();
  }
}
