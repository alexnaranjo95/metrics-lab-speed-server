import { chromium } from 'playwright';
import { measureWithPageSpeed } from '../services/pagespeed.js';


export async function runSpeedAudit(edgeUrl: string, onLog?: (msg: string) => void): Promise<Record<string, unknown>> {
  onLog?.('Running PageSpeed audit...');
  try {
    const result = await measureWithPageSpeed(edgeUrl, 'mobile');
    onLog?.(`Performance: ${result.performance}, LCP ${(result.lcp / 1000).toFixed(1)}s`);
    return { performance: result.performance, lcp: result.lcp, tbt: result.tbt, cls: result.cls };
  } catch (err) {
    onLog?.((err as Error).message);
    return { error: (err as Error).message };
  }
}

export async function scanForBugs(edgeUrl: string, onLog?: (msg: string) => void): Promise<{ errors: string[] }> {
  onLog?.('Scanning for console errors...');
  const errors: string[] = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error') {
        const text = msg.text();
        errors.push(text);
      }
    });
    await page.goto(edgeUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await context.close();
    onLog?.(`Found ${errors.length} console error(s)`);
  } finally {
    await browser.close();
  }
  return { errors };
}

export async function runVisualDiff(
  _siteId: string,
  _edgeUrl: string,
  onLog?: (msg: string) => void
): Promise<{ message: string }> {
  onLog?.('Visual diff requires baseline screenshots from a prior build. Skipping for now.');
  return { message: 'Visual diff not yet implemented in Live Edit context' };
}
