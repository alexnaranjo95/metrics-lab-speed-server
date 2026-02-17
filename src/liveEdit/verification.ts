import { chromium } from 'playwright';
import { measureWithPageSpeed } from '../services/pagespeed.js';
import type { VerificationResult } from '../events/liveEditEmitter.js';

export async function runVerificationSuite(
  optimizedUrl: string,
  _originalUrl: string,
  onLog?: (msg: string) => void
): Promise<VerificationResult> {
  const result: VerificationResult = {
    ux: { passed: false },
    visual: { passed: false },
    interactions: { passed: false },
    passed: false,
  };

  // ── UX check: PageSpeed / performance ──
  onLog?.('Verifying user experience (PageSpeed)...');
  try {
    const psi = await measureWithPageSpeed(optimizedUrl, 'mobile');
    const perf = psi?.performance ?? 0;
    result.ux = {
      passed: perf >= 50,
      notes: `Performance: ${perf}, LCP ${((psi?.lcp ?? 0) / 1000).toFixed(1)}s`,
    };
    onLog?.(result.ux.notes ?? '');
  } catch (err) {
    result.ux = { passed: false, notes: (err as Error).message };
    onLog?.(`UX check failed: ${(err as Error).message}`);
  }

  // ── Visual consistency: page loads and renders ──
  onLog?.('Verifying visual consistency...');
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--ignore-certificate-errors', '--allow-insecure-localhost'],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await page.goto(optimizedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
    await context.close();
    await browser.close();

    result.visual = {
      passed: !!title && bodyText.length > 0,
      notes: title ? `Page loads: "${title.slice(0, 40)}..."` : 'Page failed to load',
    };
    onLog?.(result.visual.notes ?? '');
  } catch (err) {
    result.visual = { passed: false, notes: (err as Error).message };
    onLog?.(`Visual check failed: ${(err as Error).message}`);
  }

  // ── Interactions: no console errors, basic interactivity ──
  onLog?.('Verifying interactions (console errors)...');
  try {
    const errors: string[] = [];
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--ignore-certificate-errors', '--allow-insecure-localhost'],
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(optimizedUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await context.close();
    await browser.close();

    result.interactions = {
      passed: errors.length === 0,
      notes: errors.length > 0 ? `${errors.length} console error(s)` : 'No console errors',
    };
    onLog?.(result.interactions.notes ?? '');
  } catch (err) {
    result.interactions = { passed: false, notes: (err as Error).message };
    onLog?.(`Interactions check failed: ${(err as Error).message}`);
  }

  result.passed = result.ux.passed && result.visual.passed && result.interactions.passed;
  onLog?.(result.passed ? 'Verification passed' : 'Verification completed with some failures');

  return result;
}
