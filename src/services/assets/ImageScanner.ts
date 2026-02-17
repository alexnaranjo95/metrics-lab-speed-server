/**
 * ImageScanner — Scans HTML for ALL image references across 10 location types.
 *
 * Returns ImageRecord[] with normalized URLs, location type, dimensions,
 * and above-fold / critical classification.
 */

import * as cheerio from 'cheerio';
import crypto from 'crypto';

export type ImageLocationType =
  | 'img-src'
  | 'img-srcset'
  | 'css-background'
  | 'style-block-background'
  | 'data-src'
  | 'data-srcset'
  | 'meta-og'
  | 'link-rel-icon'
  | 'picture-source'
  | 'css-content';

export interface ImageRecord {
  id: string;
  originalUrl: string;
  resolvedUrl: string;
  locationType: ImageLocationType;
  elementSelector: string;
  originalAttribute: string;
  width: number | null;
  height: number | null;
  isAboveFold: boolean;
  isCritical: boolean;
}

const SKIP_DOMAINS = [
  'gravatar.com', 'google.com', 'googleapis.com', 'gstatic.com',
  'googletagmanager.com', 'google-analytics.com', 'imagedelivery.net',
  'cloudflare.com', 'cloudflareinsights.com',
];

const BG_URL_RE = /(?:background(?:-image)?)\s*:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi;
const CONTENT_URL_RE = /content\s*:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi;

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

function shouldSkip(url: string): boolean {
  if (!url) return true;
  if (url.startsWith('data:')) return true;
  if (url.startsWith('blob:')) return true;
  if (url.startsWith('#')) return true;
  for (const domain of SKIP_DOMAINS) {
    if (url.includes(domain)) return true;
  }
  return false;
}

function resolveUrl(url: string, baseUrl?: string): string {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
    return url.startsWith('//') ? `https:${url}` : url;
  }
  if (baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch { /* fall through */ }
  }
  return url;
}

function makeSelector($: cheerio.CheerioAPI, el: any, index: number): string {
  const tag = (el as any).tagName || 'unknown';
  const id = $(el).attr('id');
  if (id) return `${tag}#${id}`;
  const cls = ($(el).attr('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  return cls ? `${tag}.${cls}:nth(${index})` : `${tag}:nth(${index})`;
}

/**
 * Scan HTML for all image references.
 */
export function scanImages(
  html: string,
  baseUrl?: string
): ImageRecord[] {
  const $ = cheerio.load(html);
  const records: ImageRecord[] = [];
  const seen = new Set<string>();
  let imgIndex = 0;

  function addRecord(
    url: string,
    locationType: ImageLocationType,
    selector: string,
    attribute: string,
    width: number | null,
    height: number | null,
    isAboveFold: boolean,
    isCritical: boolean
  ) {
    const resolved = resolveUrl(url, baseUrl);
    if (shouldSkip(resolved)) return;

    const id = `ml-img-${md5(resolved)}`;
    const key = `${resolved}|${locationType}`;
    if (seen.has(key)) return;
    seen.add(key);

    records.push({
      id,
      originalUrl: url,
      resolvedUrl: resolved,
      locationType,
      elementSelector: selector,
      originalAttribute: attribute,
      width,
      height,
      isAboveFold,
      isCritical,
    });
  }

  // ── Location 1: <img src> ──
  $('img').each((i, el) => {
    imgIndex++;
    const src = $(el).attr('src');
    const w = parseInt($(el).attr('width') || '', 10) || null;
    const h = parseInt($(el).attr('height') || '', 10) || null;
    const above = isElementAboveFold($, el, imgIndex);
    const critical = isElementCritical($, el);
    const selector = makeSelector($, el, i);

    if (src && !shouldSkip(src)) {
      addRecord(src, 'img-src', selector, 'src', w, h, above, critical);
    }

    // data-src variants (lazy loading)
    for (const attr of ['data-src', 'data-ll-src', 'data-lazy-src']) {
      const val = $(el).attr(attr);
      if (val && !shouldSkip(val)) {
        addRecord(val, 'data-src', selector, attr, w, h, above, critical);
      }
    }
  });

  // ── Location 2: <img srcset> ──
  $('img[srcset], img[data-srcset]').each((i, el) => {
    const selector = makeSelector($, el, i);
    const above = isElementAboveFold($, el, imgIndex);
    const critical = isElementCritical($, el);

    for (const attr of ['srcset', 'data-srcset']) {
      const val = $(el).attr(attr);
      if (!val) continue;
      const urls = parseSrcset(val);
      for (const { url } of urls) {
        if (!shouldSkip(url)) {
          addRecord(url, attr === 'srcset' ? 'img-srcset' : 'data-srcset', selector, attr, null, null, above, critical);
        }
      }
    }
  });

  // ── Location 3: CSS background-image in style attributes ──
  $('[style]').each((i, el) => {
    const style = $(el).attr('style') || '';
    const selector = makeSelector($, el, i);
    const above = isElementAboveFold($, el, 0);
    const critical = isElementCritical($, el);

    let match;
    BG_URL_RE.lastIndex = 0;
    while ((match = BG_URL_RE.exec(style)) !== null) {
      addRecord(match[1], 'css-background', selector, 'style', null, null, above, critical);
    }
  });

  // ── Location 4 & 5: <style> blocks ──
  $('style').each((i, el) => {
    const css = $(el).html() || '';
    let match;

    BG_URL_RE.lastIndex = 0;
    while ((match = BG_URL_RE.exec(css)) !== null) {
      addRecord(match[1], 'style-block-background', `style:nth(${i})`, 'background-image', null, null, false, false);
    }

    CONTENT_URL_RE.lastIndex = 0;
    while ((match = CONTENT_URL_RE.exec(css)) !== null) {
      addRecord(match[1], 'css-content', `style:nth(${i})`, 'content', null, null, false, false);
    }
  });

  // ── Location 6: <picture> source elements ──
  $('picture').each((i, el) => {
    const selector = makeSelector($, el, i);
    const above = isElementAboveFold($, el, imgIndex);
    const critical = isElementCritical($, el);

    $(el).find('source[srcset]').each((_, src) => {
      const srcset = $(src).attr('srcset') || '';
      const urls = parseSrcset(srcset);
      for (const { url } of urls) {
        if (!shouldSkip(url)) {
          addRecord(url, 'picture-source', selector, 'srcset', null, null, above, critical);
        }
      }
    });
  });

  // ── Location 7: Open Graph / Meta tags ──
  $('meta[property="og:image"], meta[name="twitter:image"]').each((i, el) => {
    const content = $(el).attr('content');
    if (content && !shouldSkip(content)) {
      const prop = $(el).attr('property') || $(el).attr('name') || 'meta';
      addRecord(content, 'meta-og', `meta[${prop}]`, 'content', null, null, false, true);
    }
  });

  // ── Location 8: Favicon and touch icons ──
  $('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !shouldSkip(href)) {
      addRecord(href, 'link-rel-icon', `link[rel="${$(el).attr('rel')}"]`, 'href', null, null, false, true);
    }
  });

  // ── Location 9: data-bg attributes (Elementor/WP) ──
  $('[data-bg], [data-background-image]').each((i, el) => {
    const selector = makeSelector($, el, i);
    const above = isElementAboveFold($, el, 0);
    const critical = isElementCritical($, el);

    for (const attr of ['data-bg', 'data-background-image']) {
      let val = $(el).attr(attr) || '';
      // Strip url(...) wrapper if present
      const urlMatch = val.match(/url\(['"]?([^'")\s]+)['"]?\)/);
      if (urlMatch) val = urlMatch[1];
      if (val && !shouldSkip(val)) {
        addRecord(val, 'css-background', selector, attr, null, null, above, critical);
      }
    }
  });

  return records;
}

/**
 * Parse a srcset attribute value into individual URL + descriptor pairs.
 */
function parseSrcset(srcset: string): Array<{ url: string; descriptor: string }> {
  return srcset
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const parts = entry.trim().split(/\s+/);
      return {
        url: parts[0] || '',
        descriptor: parts[1] || '',
      };
    })
    .filter(e => e.url && !e.url.startsWith('data:'));
}

function isElementAboveFold($: cheerio.CheerioAPI, el: any, imgIndex: number): boolean {
  if (imgIndex <= 3) return true;
  const parent = $(el).closest('header, .hero, [class*="hero"], .banner, [class*="banner"], [class*="header"], [class*="intro"]');
  return parent.length > 0;
}

function isElementCritical($: cheerio.CheerioAPI, el: any): boolean {
  // In <head>
  if ($(el).closest('head').length > 0) return true;
  // Logo
  const alt = ($(el).attr('alt') || '').toLowerCase();
  const cls = ($(el).attr('class') || '').toLowerCase();
  const src = ($(el).attr('src') || '').toLowerCase();
  if (alt.includes('logo') || cls.includes('logo') || src.includes('logo')) return true;
  // Hero image
  const parent = $(el).closest('.hero, [class*="hero"], .banner, header');
  if (parent.length > 0) return true;
  return false;
}

export { parseSrcset };
