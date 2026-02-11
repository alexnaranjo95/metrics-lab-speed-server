import fs from 'fs/promises';
import path from 'path';
import { PurgeCSS } from 'purgecss';
import CleanCSS from 'clean-css';
import { hashContent } from '../utils/crypto.js';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

export interface CssOptimizeResult {
  originalBytes: number;
  optimizedBytes: number;
  newPath?: string; // Content-hashed path if renamed
}

/**
 * Optimize a CSS file: PurgeCSS (remove unused selectors) + CleanCSS (minify).
 * Also injects font-display: swap into @font-face rules.
 */
export async function optimizeCssFile(
  cssRelativePath: string,
  htmlContents: string[],
  workDir: string,
  settings?: OptimizationSettings
): Promise<CssOptimizeResult> {
  const cssPath = path.join(workDir, cssRelativePath);

  let cssContent: string;
  try {
    cssContent = await fs.readFile(cssPath, 'utf-8');
  } catch {
    return { originalBytes: 0, optimizedBytes: 0 };
  }

  const originalBytes = Buffer.byteLength(cssContent, 'utf-8');

  // Step 1: PurgeCSS — remove unused selectors
  let purgedCss = cssContent;
  const purgeEnabled = settings?.css.purge ?? true;
  if (purgeEnabled) {
    try {
      // Build safelist from settings (convert string regex patterns to RegExp)
      const safelistConfig = settings?.css.purgeSafelist;
      const deepPatterns = (safelistConfig?.deep ?? ['/^wp-/', '/^is-/', '/^has-/']).map(p => {
        if (p.startsWith('/') && p.endsWith('/')) return new RegExp(p.slice(1, -1));
        return new RegExp(p);
      });
      const greedyPatterns = (safelistConfig?.greedy ?? ['/modal/', '/dropdown/', '/tooltip/']).map(p => {
        if (p.startsWith('/') && p.endsWith('/')) return new RegExp(p.slice(1, -1));
        return new RegExp(p);
      });

      const purgeResults = await new PurgeCSS().purge({
        content: htmlContents.map(html => ({ raw: html, extension: 'html' })),
        css: [{ raw: cssContent }],
        safelist: {
          standard: safelistConfig?.standard ?? ['active', 'open', 'visible', 'show', 'hide', 'collapsed', 'hidden', 'current-menu-item'],
          deep: deepPatterns.length > 0 ? deepPatterns : [/^wp-/, /^menu-/, /^widget-/, /^comment-/, /^post-/, /^page-/, /^has-/, /^is-/],
          greedy: greedyPatterns.length > 0 ? greedyPatterns : [/modal/, /dropdown/, /tooltip/, /popover/, /carousel/, /slider/, /swiper/],
        },
          rejected: settings?.css.purgeTestMode ?? false,
      });

      if (purgeResults.length > 0 && purgeResults[0].css) {
        purgedCss = purgeResults[0].css;
      }
    } catch (err) {
      console.warn('[css] PurgeCSS failed, using original CSS:', (err as Error).message);
    }
  }

  // Step 2: Inject font-display into @font-face rules
  const fontDisplayValue = settings?.css.fontDisplay ?? 'swap';
  purgedCss = injectFontDisplay(purgedCss, fontDisplayValue);

  // Step 3: CleanCSS — minify
  let minifiedCss = purgedCss;
  try {
    const result = new CleanCSS({ level: 2 }).minify(purgedCss);
    if (result.styles) {
      minifiedCss = result.styles;
    }
  } catch (err) {
    console.warn('[css] CleanCSS failed, using purged CSS:', (err as Error).message);
  }

  const optimizedBytes = Buffer.byteLength(minifiedCss, 'utf-8');

  // Step 4: Content-hash the filename for cache-busting
  const hash = hashContent(minifiedCss).slice(0, 8);
  const ext = path.extname(cssPath);
  const basename = path.basename(cssPath, ext);
  const hashedFilename = `${basename}.${hash}${ext}`;
  const hashedPath = path.join(path.dirname(cssPath), hashedFilename);

  await fs.writeFile(hashedPath, minifiedCss, 'utf-8');
  // Remove old file if different name
  if (hashedPath !== cssPath) {
    await fs.unlink(cssPath).catch(() => {});
  }

  const hashedRelativePath = cssRelativePath.replace(path.basename(cssRelativePath), hashedFilename);

  console.log(`[css] ${cssRelativePath}: ${originalBytes} → ${optimizedBytes} bytes (${Math.round((1 - optimizedBytes / originalBytes) * 100)}% reduction) → ${hashedFilename}`);

  return { originalBytes, optimizedBytes, newPath: hashedRelativePath };
}

/**
 * Inject font-display into @font-face rules that don't have it.
 */
function injectFontDisplay(css: string, value: string = 'swap'): string {
  return css.replace(/@font-face\s*\{([^}]*)\}/gi, (match, body) => {
    if (/font-display\s*:/i.test(body)) {
      return match; // Already has font-display
    }
    return `@font-face{${body};font-display:${value}}`;
  });
}

/**
 * Make all CSS non-render-blocking by converting <link rel="stylesheet">
 * to async loading pattern (media="print" onload="this.media='all'").
 * This eliminates render-blocking CSS, which is the main Lighthouse win.
 *
 * Note: Previously used the `critical` npm package for above-the-fold
 * extraction, but it depends on Puppeteer which crashes in Docker containers
 * that only have Playwright's Chromium installed.
 */
export async function extractCriticalCss(
  html: string,
  _cssContents: Array<{ path: string; css: string }>
): Promise<{ criticalCss: string; html: string }> {
  return { criticalCss: '', html: makeStylesheetsAsync(html) };
}

/**
 * Fallback: convert <link rel="stylesheet"> to async loading pattern.
 * Used when critical CSS extraction fails.
 */
export function makeStylesheetsAsync(html: string): string {
  return html.replace(
    /<link\s([^>]*?)rel=["']stylesheet["']([^>]*?)>/gi,
    (match, before, after) => {
      // Don't touch if already has media="print" pattern
      if (/media=["']print["']/i.test(before + after)) return match;

      const href = (before + after).match(/href=["']([^"']+)["']/i)?.[1];
      if (!href) return match;

      return `<link ${before}rel="stylesheet"${after} media="print" onload="this.media='all'">` +
        `<noscript><link rel="stylesheet" href="${href}"></noscript>`;
    }
  );
}

/**
 * Update all CSS references in HTML to use content-hashed filenames.
 */
export function updateCssReferences(html: string, renames: Map<string, string>): string {
  for (const [oldPath, newPath] of renames) {
    html = html.split(oldPath).join(newPath);
  }
  return html;
}
