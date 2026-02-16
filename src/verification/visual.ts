import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { claudeJSON } from '../ai/claude.js';
import type { PageInventory, BaselineScreenshot, VisualComparisonResult } from '../ai/types.js';

export type { VisualComparisonResult };

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function compareVisuals(
  optimizedUrl: string,
  pages: PageInventory[],
  baselineScreenshots: BaselineScreenshot[],
  workDir: string,
  log: (msg: string) => void
): Promise<VisualComparisonResult[]> {
  const results: VisualComparisonResult[] = [];
  const optimizedDir = path.join(workDir, 'optimized');
  const diffsDir = path.join(workDir, 'diffs');
  await fsp.mkdir(optimizedDir, { recursive: true });
  await fsp.mkdir(diffsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    for (const baseline of baselineScreenshots) {
      try {
        const context = await browser.newContext({
          userAgent: CHROME_UA,
          viewport: { width: baseline.width, height: baseline.height },
          deviceScaleFactor: baseline.viewport === 'mobile' ? 2 : 1,
          ignoreHTTPSErrors: true,
        });
        const page = await context.newPage();

        const optimizedPageUrl = new URL(baseline.page === '/' ? '/' : baseline.page, optimizedUrl).href;
        await page.goto(optimizedPageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000);
        await page.waitForTimeout(2000);

        // Scroll down and back up like baseline capture
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 300) {
            window.scrollTo(0, y);
            await new Promise(r => setTimeout(r, 100));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(1000);

        const safePath = (baseline.page || '/').replace(/\//g, '_') || 'index';
        const optimizedPath = path.join(optimizedDir, `${safePath}_${baseline.viewport}_full.png`);
        await page.screenshot({ path: optimizedPath, fullPage: true, type: 'png' });
        await context.close();

        // ── Pixel diff ──
        if (!fs.existsSync(baseline.fullPagePath)) {
          results.push({ page: baseline.page, viewport: baseline.viewport, diffPercent: 100, diffPixels: 0, totalPixels: 0, diffImagePath: '', baselineImagePath: baseline.fullPagePath, optimizedImagePath: optimizedPath, status: 'failed', aiReview: 'Baseline screenshot missing' });
          continue;
        }

        const baselineImg = PNG.sync.read(fs.readFileSync(baseline.fullPagePath));
        const optimizedImg = PNG.sync.read(fs.readFileSync(optimizedPath));

        const width = Math.min(baselineImg.width, optimizedImg.width);
        const height = Math.min(baselineImg.height, optimizedImg.height);

        if (width === 0 || height === 0) {
          results.push({ page: baseline.page, viewport: baseline.viewport, diffPercent: 100, diffPixels: 0, totalPixels: 0, diffImagePath: '', baselineImagePath: baseline.fullPagePath, optimizedImagePath: optimizedPath, status: 'failed', aiReview: 'Zero-dimension screenshot' });
          continue;
        }

        // Crop both to same dimensions
        const cropPNG = (img: PNG, w: number, h: number): PNG => {
          const cropped = new PNG({ width: w, height: h });
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const srcIdx = (y * img.width + x) * 4;
              const dstIdx = (y * w + x) * 4;
              cropped.data[dstIdx] = img.data[srcIdx];
              cropped.data[dstIdx + 1] = img.data[srcIdx + 1];
              cropped.data[dstIdx + 2] = img.data[srcIdx + 2];
              cropped.data[dstIdx + 3] = img.data[srcIdx + 3];
            }
          }
          return cropped;
        };

        const croppedBaseline = cropPNG(baselineImg, width, height);
        const croppedOptimized = cropPNG(optimizedImg, width, height);

        const diff = new PNG({ width, height });
        const diffPixels = pixelmatch(
          croppedBaseline.data, croppedOptimized.data, diff.data, width, height,
          { threshold: 0.15, includeAA: false }
        );

        const totalPixels = width * height;
        const diffPercent = (diffPixels / totalPixels) * 100;

        const diffPath = path.join(diffsDir, `${safePath}_${baseline.viewport}_diff.png`);
        fs.writeFileSync(diffPath, PNG.sync.write(diff));

        let status: VisualComparisonResult['status'];
        if (diffPercent < 0.5) status = 'identical';
        else if (diffPercent < 2.0) status = 'acceptable';
        else if (diffPercent < 10.0) status = 'needs-review';
        else status = 'failed';

        // Height difference check
        if (Math.abs(baselineImg.height - optimizedImg.height) > 200) {
          status = status === 'identical' || status === 'acceptable' ? 'needs-review' : status;
          log(`${baseline.page} @ ${baseline.viewport}: Height diff ${baselineImg.height}px -> ${optimizedImg.height}px`);
        }

        results.push({
          page: baseline.page, viewport: baseline.viewport, diffPercent, diffPixels, totalPixels,
          diffImagePath: diffPath, baselineImagePath: baseline.fullPagePath, optimizedImagePath: optimizedPath, status,
        });

        log(`${baseline.page} @ ${baseline.viewport}: ${diffPercent.toFixed(2)}% diff (${status})`);
      } catch (err) {
        results.push({
          page: baseline.page, viewport: baseline.viewport, diffPercent: 100, diffPixels: 0, totalPixels: 0,
          diffImagePath: '', baselineImagePath: baseline.fullPagePath, optimizedImagePath: '',
          status: 'failed', aiReview: `Comparison failed: ${(err as Error).message}`,
        });
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

export async function aiVisualReview(
  result: VisualComparisonResult,
  currentSettings: Record<string, any>,
  log: (msg: string) => void
): Promise<{ overallVerdict: string; issues: Array<{ description: string; severity: string; suggestedFix: string; settingToChange?: string }> }> {
  if (!fs.existsSync(result.baselineImagePath) || !fs.existsSync(result.optimizedImagePath)) {
    return { overallVerdict: 'fail', issues: [{ description: 'Screenshots not available for AI review', severity: 'critical', suggestedFix: 'Rebuild with screenshots enabled' }] };
  }

  const baselineB64 = fs.readFileSync(result.baselineImagePath).toString('base64');
  const optimizedB64 = fs.readFileSync(result.optimizedImagePath).toString('base64');

  const system = `You are a visual QA expert comparing a live WordPress website (original) against an optimized static version. Identify EVERY visual difference and determine if it's a problem.

ACCEPTABLE: Minor font rendering, missing admin bar, removed tracking pixels, emoji style diffs.
PROBLEMS: Missing images, broken layout, missing icons, wrong fonts, missing backgrounds, broken nav, missing content, spacing issues.

Return JSON:
{
  "overallVerdict": "pass" | "fail",
  "issues": [{ "description": "...", "severity": "critical" | "major" | "minor", "suggestedFix": "...", "settingToChange": "css.purgeSafelistPatterns" }]
}`;

  const userContent: any[] = [
    { type: 'text', text: `Compare page "${result.page}" at ${result.viewport} viewport (${result.diffPercent.toFixed(2)}% pixel diff). Image 1 = ORIGINAL, Image 2 = OPTIMIZED. Current settings: ${JSON.stringify(currentSettings, null, 2).substring(0, 2000)}` },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: baselineB64 } },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: optimizedB64 } },
  ];

  try {
    const { data } = await claudeJSON(system, userContent, 4000);
    return data;
  } catch (err) {
    log(`AI visual review failed: ${(err as Error).message}`);
    return { overallVerdict: 'fail', issues: [{ description: `AI review error: ${(err as Error).message}`, severity: 'critical', suggestedFix: 'Manual review needed' }] };
  }
}
