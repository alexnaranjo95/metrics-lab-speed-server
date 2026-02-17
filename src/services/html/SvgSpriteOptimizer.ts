/**
 * SvgSpriteOptimizer — Deduplicates repeated inline SVGs into a single
 * <svg> sprite with <symbol> definitions and <use> references.
 *
 * Targets social icons, nav icons, Elementor widgets, WooCommerce stars
 * that appear 3+ times identically on the page.
 */

import crypto from 'crypto';
import type { CheerioAPI } from 'cheerio';

export interface SvgSpriteResult {
  spriteCreated: boolean;
  symbolCount: number;
  replacements: number;
  savedBytes: number;
}

/**
 * Find identical inline SVGs appearing 3+ times and deduplicate
 * them into a sprite with <symbol>/<use> pattern.
 */
export function deduplicateInlineSvgs($: CheerioAPI): SvgSpriteResult {
  const svgElements = $('svg').toArray();
  if (svgElements.length < 3) {
    return { spriteCreated: false, symbolCount: 0, replacements: 0, savedBytes: 0 };
  }

  // Group SVGs by their inner content (path/shape data)
  const groups = new Map<string, Array<{ el: any; outerHtml: string; viewBox: string; classes: string; ariaHidden: string; width: string; height: string }>>();

  for (const el of svgElements) {
    const $svg = $(el);
    // Skip SVGs that are already sprite containers or <use> references
    if ($svg.find('symbol').length > 0 || $svg.find('use').length > 0) continue;
    // Skip SVGs with style="display:none" (hidden sprites)
    if (($svg.attr('style') || '').includes('display:none') || ($svg.attr('style') || '').includes('display: none')) continue;

    const innerHTML = $svg.html()?.trim() || '';
    if (!innerHTML) continue;

    const hash = crypto.createHash('md5').update(innerHTML).digest('hex').slice(0, 8);
    const viewBox = $svg.attr('viewBox') || '';
    const classes = $svg.attr('class') || '';
    const ariaHidden = $svg.attr('aria-hidden') || '';
    const width = $svg.attr('width') || '';
    const height = $svg.attr('height') || '';
    const outerHtml = $.html(el);

    if (!groups.has(hash)) {
      groups.set(hash, []);
    }
    groups.get(hash)!.push({ el, outerHtml, viewBox, classes, ariaHidden, width, height });
  }

  // Filter to groups with 3+ identical SVGs
  const duplicateGroups = Array.from(groups.entries()).filter(([_, items]) => items.length >= 3);

  if (duplicateGroups.length === 0) {
    return { spriteCreated: false, symbolCount: 0, replacements: 0, savedBytes: 0 };
  }

  // Build sprite <svg> with <symbol> definitions
  let spriteSymbols = '';
  let totalReplacements = 0;
  let totalSavedBytes = 0;

  for (const [hash, items] of duplicateGroups) {
    const symbolId = `icon-${hash}`;
    const first = items[0];
    const innerHTML = $(first.el).html()?.trim() || '';
    const viewBoxAttr = first.viewBox ? ` viewBox="${first.viewBox}"` : '';

    spriteSymbols += `<symbol id="${symbolId}"${viewBoxAttr}>${innerHTML}</symbol>\n`;

    // Replace each occurrence with <svg><use></svg>
    for (const item of items) {
      const widthAttr = item.width ? ` width="${item.width}"` : '';
      const heightAttr = item.height ? ` height="${item.height}"` : '';
      const classAttr = item.classes ? ` class="${item.classes}"` : '';
      const ariaAttr = item.ariaHidden ? ` aria-hidden="${item.ariaHidden}"` : '';
      const viewBox = item.viewBox ? ` viewBox="${item.viewBox}"` : '';

      const useRef = `<svg${classAttr}${ariaAttr}${widthAttr}${heightAttr}${viewBox}><use href="#${symbolId}"></use></svg>`;

      const originalSize = Buffer.byteLength(item.outerHtml, 'utf-8');
      const newSize = Buffer.byteLength(useRef, 'utf-8');
      totalSavedBytes += Math.max(0, originalSize - newSize);

      $(item.el).replaceWith(useRef);
      totalReplacements++;
    }
  }

  // Inject sprite at top of <body>
  const body = $('body').first();
  if (body.length && spriteSymbols) {
    const sprite = `<svg style="display:none" xmlns="http://www.w3.org/2000/svg">\n${spriteSymbols}</svg>\n`;
    body.prepend(sprite);
  }

  console.log(`[svg-sprite] Created sprite: ${duplicateGroups.length} symbols, ${totalReplacements} replacements, ~${(totalSavedBytes / 1024).toFixed(1)}KB saved`);

  return {
    spriteCreated: true,
    symbolCount: duplicateGroups.length,
    replacements: totalReplacements,
    savedBytes: totalSavedBytes,
  };
}
