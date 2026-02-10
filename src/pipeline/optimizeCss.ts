import fs from 'fs/promises';
import path from 'path';
import { PurgeCSS } from 'purgecss';
import CleanCSS from 'clean-css';
import { hashContent } from '../utils/crypto.js';

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
  workDir: string
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
  try {
    const purgeResults = await new PurgeCSS().purge({
      content: htmlContents.map(html => ({ raw: html, extension: 'html' })),
      css: [{ raw: cssContent }],
      safelist: {
        standard: ['active', 'open', 'visible', 'show', 'hide', 'collapsed', 'hidden', 'current-menu-item'],
        deep: [/^wp-/, /^menu-/, /^widget-/, /^comment-/, /^post-/, /^page-/, /^has-/, /^is-/],
        greedy: [/modal/, /dropdown/, /tooltip/, /popover/, /carousel/, /slider/, /swiper/],
      },
    });

    if (purgeResults.length > 0 && purgeResults[0].css) {
      purgedCss = purgeResults[0].css;
    }
  } catch (err) {
    console.warn('[css] PurgeCSS failed, using original CSS:', (err as Error).message);
  }

  // Step 2: Inject font-display: swap into @font-face rules
  purgedCss = injectFontDisplaySwap(purgedCss);

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
 * Inject font-display: swap into @font-face rules that don't have it.
 */
function injectFontDisplaySwap(css: string): string {
  return css.replace(/@font-face\s*\{([^}]*)\}/gi, (match, body) => {
    if (/font-display\s*:/i.test(body)) {
      return match; // Already has font-display
    }
    return `@font-face{${body};font-display:swap}`;
  });
}

/**
 * Extract critical (above-the-fold) CSS from HTML + CSS content.
 * Uses the `critical` npm package.
 * Returns { criticalCss, remainingCss }.
 */
export async function extractCriticalCss(
  html: string,
  cssContents: Array<{ path: string; css: string }>
): Promise<{ criticalCss: string; html: string }> {
  try {
    // Dynamic import since `critical` is a CJS/ESM hybrid
    const { generate } = await import('critical');

    const result = await generate({
      html,
      css: cssContents.map(c => c.css).join('\n'),
      width: 1300,
      height: 900,
      inline: true,  // Inline critical CSS + async load the rest
      extract: false,
      penthouse: {
        timeout: 30000,
      },
    });

    // `critical` with inline:true returns the modified HTML with:
    // - Critical CSS in a <style> tag in <head>
    // - Non-critical CSS loaded via <link rel="stylesheet" media="print" onload="this.media='all'">
    const outputHtml = typeof result === 'string' ? result : result.html;
    const criticalCss = typeof result === 'string' ? '' : (result.css || '');

    return { criticalCss, html: outputHtml };
  } catch (err) {
    console.warn('[css] Critical CSS extraction failed (non-fatal):', (err as Error).message);
    // Fallback: manually make stylesheets non-render-blocking
    return { criticalCss: '', html: makeStylesheetsAsync(html) };
  }
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
