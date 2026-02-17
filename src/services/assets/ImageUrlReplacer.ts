/**
 * ImageUrlReplacer — Applies all URL replacements to Cheerio DOM.
 *
 * Implements 9 replacement rules:
 * 1. Simple <img src>
 * 2. <img srcset> reconstruction
 * 3. Inline style background-image
 * 4. <style> block background-image
 * 5. <picture> simplification to <img>
 * 6. Open Graph / meta tags
 * 7. data-src / data-srcset conversion to native attrs
 * 8. Add missing width/height to all <img>
 * 9. Add loading="lazy" to below-fold images
 */

import type { CheerioAPI } from 'cheerio';
import type { ImageRecord } from './ImageScanner.js';
import type { MigrationResult } from './ImageBatchMigrator.js';

function getAccountHash(): string | undefined {
  try {
    const { config } = require('../../config.js');
    return config.CF_IMAGES_ACCOUNT_HASH;
  } catch {
    return undefined;
  }
}

/**
 * Build a lookup map from original URL to CF Images delivery URL.
 */
function buildUrlMap(
  records: ImageRecord[],
  results: MigrationResult[]
): Map<string, MigrationResult> {
  const map = new Map<string, MigrationResult>();
  for (let i = 0; i < records.length; i++) {
    const result = results[i];
    if (!result || result.status === 'failed' || result.status === 'skipped') continue;
    map.set(records[i].originalUrl, result);
    map.set(records[i].resolvedUrl, result);
  }
  return map;
}

/**
 * Get the appropriate variant URL for a migration result.
 */
function variantUrl(result: MigrationResult, variant: string): string {
  const base = result.cfDeliveryUrl;
  return base.replace(/\/public$/, `/${variant}`);
}

/**
 * Apply all URL replacements to the Cheerio DOM.
 */
export function replaceAllUrls(
  $: CheerioAPI,
  records: ImageRecord[],
  results: MigrationResult[]
): { replacedCount: number; dimensionsAdded: number } {
  const urlMap = buildUrlMap(records, results);
  let replacedCount = 0;
  let dimensionsAdded = 0;
  let imgIndex = 0;

  // ── Rule 1: Simple <img src> ──
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    const result = urlMap.get(src);
    if (result && result.cfDeliveryUrl !== src) {
      $(el).attr('src', result.cfDeliveryUrl);
      replacedCount++;
    }
  });

  // ── Rule 2: <img srcset> reconstruction ──
  $('img[srcset]').each((_, el) => {
    const srcset = $(el).attr('srcset') || '';
    const newSrcset = reconstructSrcset(srcset, urlMap);
    if (newSrcset !== srcset) {
      $(el).attr('srcset', newSrcset);
      replacedCount++;
    }
  });

  // ── Rule 3: Inline style background-image ──
  $('[style]').each((_, el) => {
    const style = $(el).attr('style') || '';
    const newStyle = replaceBackgroundUrls(style, urlMap, 'bg-desktop');
    if (newStyle !== style) {
      $(el).attr('style', newStyle);
      replacedCount++;
    }
  });

  // ── Rule 4: <style> block background-image ──
  $('style').each((_, el) => {
    const css = $(el).html() || '';
    const newCss = replaceBackgroundUrls(css, urlMap, 'bg-desktop');
    if (newCss !== css) {
      $(el).html(newCss);
      replacedCount++;
    }
  });

  // ── Rule 5: <picture> simplification ──
  $('picture').each((_, el) => {
    const img = $(el).find('img').first();
    if (!img.length) return;

    const src = img.attr('src') || '';
    const result = urlMap.get(src);
    if (!result) return;

    const alt = img.attr('alt') || '';
    const cls = img.attr('class') || '';
    const w = img.attr('width') || '';
    const h = img.attr('height') || '';

    const newImg = `<img src="${result.cfDeliveryUrl}" alt="${alt}" ${cls ? `class="${cls}"` : ''} ${w ? `width="${w}"` : ''} ${h ? `height="${h}"` : ''}>`;
    $(el).replaceWith(newImg);
    replacedCount++;
  });

  // ── Rule 6: Open Graph / meta tags ──
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => {
    const content = $(el).attr('content') || '';
    const result = urlMap.get(content);
    if (result) {
      $(el).attr('content', variantUrl(result, 'og'));
      replacedCount++;
    }
  });

  // ── Rule 7: data-src / data-srcset conversion ──
  $('img[data-src], img[data-ll-src], img[data-lazy-src]').each((_, el) => {
    for (const attr of ['data-src', 'data-ll-src', 'data-lazy-src']) {
      const val = $(el).attr(attr);
      if (!val) continue;
      const result = urlMap.get(val);
      const newSrc = result ? result.cfDeliveryUrl : val;
      $(el).attr('src', newSrc);
      $(el).removeAttr(attr);
      if (result) replacedCount++;
    }
    // Clean up lazy-load tracking attributes
    $(el).removeAttr('data-lazyloaded');
    $(el).removeAttr('data-ll-status');
    $(el).removeAttr('data-lazy-loaded');
  });

  $('img[data-srcset]').each((_, el) => {
    const val = $(el).attr('data-srcset') || '';
    const newSrcset = reconstructSrcset(val, urlMap);
    $(el).attr('srcset', newSrcset);
    $(el).removeAttr('data-srcset');
    replacedCount++;
  });

  // ── Rule 7: Favicon/icon replacement ──
  $('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const result = urlMap.get(href);
    if (result) {
      $(el).attr('href', variantUrl(result, 'icon'));
      replacedCount++;
    }
  });

  // ── Rule 8: Add missing dimensions to ALL <img> ──
  $('img').each((_, el) => {
    const hasWidth = $(el).attr('width');
    const hasHeight = $(el).attr('height');
    if (hasWidth && hasHeight) return;

    const src = $(el).attr('src') || '';
    const result = urlMap.get(src);
    if (result && result.width && result.height) {
      if (!hasWidth) { $(el).attr('width', String(result.width)); dimensionsAdded++; }
      if (!hasHeight) { $(el).attr('height', String(result.height)); dimensionsAdded++; }
    }
  });

  // ── Rule 9: loading="lazy" for below-fold, eager for above-fold ──
  imgIndex = 0;
  $('img').each((_, el) => {
    imgIndex++;
    const inHero = $(el).closest('header, .hero, [class*="hero"], .banner, [class*="banner"], [class*="header"], [class*="intro"]').length > 0;
    const isAboveFold = imgIndex <= 3 || inHero;

    if (isAboveFold) {
      $(el).attr('fetchpriority', 'high');
      $(el).attr('loading', 'eager');
      $(el).removeAttr('decoding');
    } else {
      if (!$(el).attr('loading')) {
        $(el).attr('loading', 'lazy');
      }
      if (!$(el).attr('decoding')) {
        $(el).attr('decoding', 'async');
      }
      $(el).removeAttr('fetchpriority');
    }
  });

  return { replacedCount, dimensionsAdded };
}

function reconstructSrcset(
  srcset: string,
  urlMap: Map<string, MigrationResult>
): string {
  return srcset
    .split(',')
    .map(entry => {
      const parts = entry.trim().split(/\s+/);
      const url = parts[0] || '';
      const descriptor = parts[1] || '';
      const result = urlMap.get(url);
      if (result) {
        const variant = descriptor.includes('640') || descriptor.includes('300') ? 'thumb' : 'public';
        return `${variantUrl(result, variant)} ${descriptor}`.trim();
      }
      return entry.trim();
    })
    .join(', ');
}

function replaceBackgroundUrls(
  css: string,
  urlMap: Map<string, MigrationResult>,
  variant: string
): string {
  let result = css;
  for (const [originalUrl, migration] of urlMap) {
    if (result.includes(originalUrl)) {
      result = result.replaceAll(originalUrl, variantUrl(migration, variant));
    }
  }
  return result;
}
