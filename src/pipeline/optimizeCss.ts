import fs from 'fs/promises';
import path from 'path';
import { PurgeCSS } from 'purgecss';
import postcss from 'postcss';
import cssnano from 'cssnano';
import { hashContent } from '../utils/crypto.js';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

export interface CssOptimizeResult {
  originalBytes: number;
  optimizedBytes: number;
  newPath?: string;
}

type Aggressiveness = 'safe' | 'moderate' | 'aggressive';

/** Get safelist by aggressiveness level; merge custom patterns from schema. */
function getSafelist(aggressiveness: Aggressiveness, customSafelist?: { standard?: string[]; deep?: string[]; greedy?: string[] }) {
  const toRegExp = (p: string) => {
    if (p.startsWith('/') && p.endsWith('/')) return new RegExp(p.slice(1, -1));
    return new RegExp(p);
  };

  const base = (() => {
    switch (aggressiveness) {
      case 'safe':
        return {
          standard: [
            /^wp-/, /^is-/, /^has-/, /^ast-/, /^elementor-/, /^menu-/, /^sub-menu/, /^site-/, /^main-/,
            /^custom-logo/, /^header/, /^footer/, /^nav/, /^mobile/, /^tablet/, /^toggle/, /^sticky/,
            /^responsive/, /^popup/, /^off-canvas/, /^logo/, /^woo/, /^swiper-/, /^slick-/, /^owl-/,
            /^gallery/, /^lightbox/, /^fancybox/, /^modal/, /^dropdown/, /^collapse/, /^accordion/,
            /^tab-/, /^active/, /^open/, /^show/, /^hide/, /^visible/, /^hidden/, /^fade/, /^slide/,
            /^animate/, /^widget/, /^sidebar/, /^comment/, /^avatar/, /^breadcrumb/,
          ],
          deep: [/header/, /footer/, /nav/, /mobile/, /tablet/, /logo/, /toggle/, /responsive/, /breakpoint/, /menu/, /sidebar/],
          greedy: [/logo/, /brand/, /hero/],
        };
      case 'moderate':
        return {
          standard: [/^wp-/, /^is-/, /^has-/, /^menu-/, /^sub-menu/, /^site-/, /^main-/, /^custom-logo/, /^header/, /^footer/, /^nav/, /^active/, /^open/, /^show/, /^hide/],
          deep: [/header/, /footer/, /nav/, /menu/],
          greedy: [/logo/],
        };
      case 'aggressive':
        return {
          standard: [/^wp-block/, /^is-/, /^has-/],
          deep: [] as RegExp[],
          greedy: [] as RegExp[],
        };
    }
  })();

  // Merge custom patterns from schema
  if (customSafelist?.standard?.length) base.standard.push(...customSafelist.standard.map(toRegExp));
  if (customSafelist?.deep?.length) base.deep.push(...customSafelist.deep.map(toRegExp));
  if (customSafelist?.greedy?.length) base.greedy.push(...customSafelist.greedy.map(toRegExp));

  return base;
}

/** Get cssnano config by preset. */
function getCssnanoConfig(preset: 'lite' | 'default' | 'advanced') {
  switch (preset) {
    case 'lite':
      return cssnano({ preset: ['default', { colormin: false, convertValues: false, discardDuplicates: false, mergeLonghand: false, mergeRules: false, minifyFontValues: false, minifyGradients: false, minifyParams: false, minifySelectors: false, normalizeUrl: false }] });
    case 'advanced':
      return cssnano({ preset: 'advanced' });
    default:
      return cssnano({ preset: 'default' });
  }
}

/**
 * Optimize a CSS file: PurgeCSS + font-display + cssnano.
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

  // Step 1: PurgeCSS
  let purgedCss = cssContent;
  const purgeEnabled = settings?.css.purge ?? true;
  const purgeTestMode = settings?.css.purgeTestMode ?? false;

  const toRegExp = (p: string) => {
    if (p.startsWith('/') && p.endsWith('/')) return new RegExp(p.slice(1, -1));
    return new RegExp(p);
  };

  if (purgeEnabled) {
    try {
      const aggressiveness = (settings?.css.purgeAggressiveness ?? 'safe') as Aggressiveness;
      const safelist = getSafelist(aggressiveness, settings?.css.purgeSafelist);
      const blocklist = (settings?.css.purgeBlocklistPatterns ?? []).map(toRegExp);

      const purgeResults = await new PurgeCSS().purge({
        content: htmlContents.map(html => ({ raw: html, extension: 'html' })),
        css: [{ raw: cssContent }],
        safelist,
        blocklist: blocklist.length > 0 ? blocklist : undefined,
        rejected: purgeTestMode,
      });

      const result = purgeResults[0];
      if (result) {
        if (purgeTestMode && result.rejected) {
          console.log(`[css] [TEST MODE] PurgeCSS would remove ${result.rejected.length} selectors`);
          result.rejected.slice(0, 30).forEach(s => console.log(`[css]   Would remove: ${s}`));
          if (result.rejected.length > 30) console.log(`[css]   ...and ${result.rejected.length - 30} more`);
        }
        if (!purgeTestMode && result.css) purgedCss = result.css;
      }
    } catch (err) {
      console.warn('[css] PurgeCSS failed, using original CSS:', (err as Error).message);
    }
  }

  // Step 2: Font-display
  const fontDisplayValue = settings?.css.fontDisplay ?? 'swap';
  purgedCss = injectFontDisplay(purgedCss, fontDisplayValue);

  // Step 3: Minify with cssnano
  let minifiedCss = purgedCss;
  const minifyPreset = (settings?.css.minifyPreset ?? 'default') as 'lite' | 'default' | 'advanced';
  try {
    const processor = postcss([getCssnanoConfig(minifyPreset)]);
    const result = await processor.process(purgedCss, { from: cssPath });
    minifiedCss = result.css;
  } catch (err) {
    console.warn('[css] cssnano failed, using unminified CSS:', (err as Error).message);
  }

  const optimizedBytes = Buffer.byteLength(minifiedCss, 'utf-8');

  // Step 4: Content-hash filename
  const hash = hashContent(minifiedCss).slice(0, 8);
  const ext = path.extname(cssPath);
  const basename = path.basename(cssPath, ext);
  const hashedFilename = `${basename}.${hash}${ext}`;
  const hashedPath = path.join(path.dirname(cssPath), hashedFilename);

  await fs.writeFile(hashedPath, minifiedCss, 'utf-8');
  if (hashedPath !== cssPath) await fs.unlink(cssPath).catch(() => {});

  const hashedRelativePath = cssRelativePath.replace(path.basename(cssRelativePath), hashedFilename);
  console.log(`[css] ${cssRelativePath}: ${originalBytes} → ${optimizedBytes} bytes (${Math.round((1 - optimizedBytes / originalBytes) * 100)}% reduction) → ${hashedFilename}`);

  return { originalBytes, optimizedBytes, newPath: hashedRelativePath };
}

/**
 * Inject or replace font-display in @font-face rules.
 * If missing, add it. If present, replace with the selected value.
 */
function injectFontDisplay(css: string, value: string = 'swap'): string {
  return css.replace(/@font-face\s*\{([^}]*)\}/gi, (match, body) => {
    if (/font-display\s*:/i.test(body)) {
      const updated = body.replace(/font-display\s*:\s*[^;]+/i, `font-display: ${value}`);
      return `@font-face{${updated}}`;
    }
    return `@font-face{${body};font-display:${value}}`;
  });
}

/**
 * Make stylesheets async (media="print" onload="this.media='all'").
 * Only applies when makeNonCriticalAsync is true.
 */
export async function extractCriticalCss(
  html: string,
  _cssContents: Array<{ path: string; css: string }>,
  settings?: { critical?: boolean; criticalForMobile?: boolean; makeNonCriticalAsync?: boolean }
): Promise<{ criticalCss: string; html: string }> {
  const makeAsync = settings?.makeNonCriticalAsync ?? true;
  return { criticalCss: '', html: makeAsync ? makeStylesheetsAsync(html) : html };
}

/**
 * Convert <link rel="stylesheet"> to async loading pattern.
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
