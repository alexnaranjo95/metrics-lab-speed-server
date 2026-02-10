import fs from 'fs/promises';
import path from 'path';
import { PurgeCSS } from 'purgecss';
import CleanCSS from 'clean-css';

export interface CssOptimizeResult {
  originalBytes: number;
  optimizedBytes: number;
}

/**
 * Optimize a CSS file: PurgeCSS (remove unused selectors) + CleanCSS (minify).
 */
export async function optimizeCss(
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
    console.warn('PurgeCSS failed, using original CSS:', (err as Error).message);
  }

  // Step 2: CleanCSS — minify
  let minifiedCss = purgedCss;
  try {
    const result = new CleanCSS({ level: 2 }).minify(purgedCss);
    if (result.styles) {
      minifiedCss = result.styles;
    }
  } catch (err) {
    console.warn('CleanCSS failed, using purged CSS:', (err as Error).message);
  }

  const optimizedBytes = Buffer.byteLength(minifiedCss, 'utf-8');

  // Write optimized CSS back
  await fs.writeFile(cssPath, minifiedCss, 'utf-8');

  return { originalBytes, optimizedBytes };
}
