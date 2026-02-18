/**
 * CriticalCssExtractor — Extracts above-the-fold CSS using Playwright
 * CSS coverage API and inlines it in <head> for instant first paint.
 *
 * This replaces the stub `extractCriticalCss()` in optimizeCss.ts with
 * a real Playwright-based implementation.
 */

import { chromium } from 'playwright';
import http from 'http';
import type { CheerioAPI } from 'cheerio';

const MAX_CRITICAL_CSS_KB = 20;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 320, height: 480 };

export interface CriticalCssExtractOptions {
  criticalDimensions?: Array<{ width: number; height: number }>;
  criticalForMobile?: boolean;
}

export interface CriticalCssResult {
  criticalCss: string;
  criticalSizeKb: number;
  totalCssSizeKb: number;
}

function getViewportsToExtract(options?: CriticalCssExtractOptions): Array<{ width: number; height: number }> {
  const dims = options?.criticalDimensions;
  const forMobile = options?.criticalForMobile !== false;
  if (!dims?.length) {
    return forMobile ? [MOBILE_VIEWPORT, DEFAULT_VIEWPORT] : [DEFAULT_VIEWPORT];
  }
  const hasMobile = dims.some(d => d.width <= 480);
  if (!forMobile) {
    return [dims[dims.length - 1] ?? DEFAULT_VIEWPORT];
  }
  if (!hasMobile) {
    return [MOBILE_VIEWPORT, ...dims];
  }
  return dims;
}

/**
 * Extract critical CSS by rendering the page with Playwright and
 * collecting CSS coverage for above-the-fold content.
 */
export async function extractCriticalCss(
  html: string,
  onLog?: (msg: string) => void,
  options?: CriticalCssExtractOptions
): Promise<CriticalCssResult> {
  const viewports = getViewportsToExtract(options);
  onLog?.(`Starting critical CSS extraction (${viewports.length} viewport(s))...`);

  // Serve the HTML locally for Playwright to visit
  const { server, url } = await createTempServer(html);

  let browser;
  const allCriticalCss: string[] = [];
  let totalCssSize = 0;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    for (let v = 0; v < viewports.length; v++) {
      const { width, height } = viewports[v];
      onLog?.(`Extracting at viewport ${width}x${height}...`);

      const context = await browser.newContext({
        viewport: { width, height },
      });
      const page = await context.newPage();

      // Start CSS coverage
      await page.coverage.startCSSCoverage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000); // let styles settle

      // Get above-fold element classes
      const aboveFoldClasses = await page.evaluate(() => {
        const vh = window.innerHeight;
        const classes = new Set<string>();
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.top < vh && rect.bottom > 0) {
            el.classList.forEach(cls => classes.add(cls));
            classes.add(el.tagName.toLowerCase());
          }
        });
        return Array.from(classes);
      });

      // Stop CSS coverage
      const coverage = await page.coverage.stopCSSCoverage();

      await context.close();

      // Extract used CSS rules from coverage
      let viewportCss = '';
      let viewportTotalSize = 0;
      for (const entry of coverage) {
        const text = entry.text || '';
        viewportTotalSize += text.length;
        for (const range of entry.ranges) {
          viewportCss += text.slice(range.start, range.end) + '\n';
        }
      }
      if (totalCssSize === 0) totalCssSize = viewportTotalSize;

      viewportCss = minifyCritical(viewportCss);
      const viewportSizeKb = Buffer.byteLength(viewportCss, 'utf-8') / 1024;
      if (viewportSizeKb > MAX_CRITICAL_CSS_KB) {
        viewportCss = truncateToEssentials(viewportCss, aboveFoldClasses);
      }
      allCriticalCss.push(viewportCss);
    }

    // Merge CSS from all viewports (simple concatenation, minify again to dedupe whitespace)
    let mergedCss = [...new Set(allCriticalCss)].join('\n');
    mergedCss = minifyCritical(mergedCss);
    const finalSizeKb = Buffer.byteLength(mergedCss, 'utf-8') / 1024;
    if (finalSizeKb > MAX_CRITICAL_CSS_KB) {
      mergedCss = truncateToEssentials(mergedCss, []);
    }
    onLog?.(`Critical CSS extracted: ${finalSizeKb.toFixed(1)}KB (${viewports.length} viewport(s))`);

    return {
      criticalCss: mergedCss,
      criticalSizeKb: Buffer.byteLength(mergedCss, 'utf-8') / 1024,
      totalCssSizeKb: totalCssSize / 1024 || 0,
    };
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

/**
 * Inject critical CSS into Cheerio DOM and set up non-blocking full CSS loading.
 */
export function injectCriticalCss(
  $: CheerioAPI,
  criticalCss: string,
  cssFilePaths: string[]
): void {
  if (!criticalCss.trim()) return;

  const head = $('head').first();
  if (!head.length) return;

  // Inject inline critical CSS
  head.append(`<style id="ml-critical-css">${criticalCss}</style>`);

  // Convert stylesheet links to non-blocking pattern
  for (const cssPath of cssFilePaths) {
    const existingLink = $(`link[href="${cssPath}"]`);
    if (existingLink.length) {
      existingLink.replaceWith(
        `<link rel="preload" href="${cssPath}" as="style" onload="this.onload=null;this.rel='stylesheet'">\n` +
        `<noscript><link rel="stylesheet" href="${cssPath}"></noscript>`
      );
    }
  }
}

function minifyCritical(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
    .replace(/\s+/g, ' ')            // collapse whitespace
    .replace(/\s*{\s*/g, '{')         // trim around braces
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*:\s*/g, ':')
    .replace(/;}/g, '}')             // remove last semicolon
    .trim();
}

function truncateToEssentials(css: string, aboveFoldClasses: string[]): string {
  // Split into rules and keep only those matching above-fold selectors
  const rules = css.split('}').filter(Boolean);
  const kept: string[] = [];
  let size = 0;
  const maxBytes = MAX_CRITICAL_CSS_KB * 1024;

  // Priority order: @-rules first (keyframes, font-face), then matches
  const atRules: string[] = [];
  const matchedRules: string[] = [];
  const essentialTags = ['html', 'body', ':root', '*'];

  for (const rule of rules) {
    const fullRule = rule.trim() + '}';
    if (fullRule.startsWith('@')) {
      atRules.push(fullRule);
      continue;
    }

    const selector = fullRule.split('{')[0]?.trim() || '';
    const isEssential = essentialTags.some(tag => selector.includes(tag)) ||
      aboveFoldClasses.some(cls => selector.includes(`.${cls}`));

    if (isEssential) {
      matchedRules.push(fullRule);
    }
  }

  for (const rule of [...atRules, ...matchedRules]) {
    const ruleSize = Buffer.byteLength(rule, 'utf-8');
    if (size + ruleSize > maxBytes) break;
    kept.push(rule);
    size += ruleSize;
  }

  return kept.join('\n');
}

function createTempServer(html: string): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        return reject(new Error('Failed to start temp server'));
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });

    server.on('error', reject);
  });
}
