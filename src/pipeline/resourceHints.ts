import * as cheerio from 'cheerio';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

/**
 * Inject resource hints: LCP preload, preconnect for critical origins,
 * custom preconnect/dns-prefetch domains, cleanup stale hints.
 */
export function injectResourceHints(html: string, settings?: OptimizationSettings): string {
  const $ = cheerio.load(html);
  const hints = (settings?.resourceHints ?? {}) as {
    enabled?: boolean;
    autoPreloadLcpImage?: boolean;
    autoPreconnect?: boolean;
    removeUnusedPreconnects?: boolean;
    customPreconnectDomains?: string[];
    customDnsPrefetchDomains?: string[];
  };
  if (hints.enabled === false) return html;

  const autoPreloadLcp = hints.autoPreloadLcpImage !== false;
  const autoPreconnect = hints.autoPreconnect !== false;
  const removeUnused = hints.removeUnusedPreconnects !== false;
  const customPreconnect = hints.customPreconnectDomains ?? [];
  const customDnsPrefetch = hints.customDnsPrefetchDomains ?? [];

  // ── 1. Detect LCP candidate and preload it (when enabled) ──
  if (autoPreloadLcp) {
    const lcpImage = detectLcpImage($);
    if (lcpImage) {
      const alreadyPreloaded = $(`link[rel="preload"][href="${lcpImage}"]`).length > 0;
      if (!alreadyPreloaded) {
        const isWebp = lcpImage.endsWith('.webp');
        const isAvif = lcpImage.endsWith('.avif');
        const typeAttr = isAvif ? ' type="image/avif"' : isWebp ? ' type="image/webp"' : '';

        $('head').prepend(`<link rel="preload" as="image" href="${lcpImage}"${typeAttr}>`);
        console.log(`[hints] Added preload for LCP image: ${lcpImage}`);
      }
    }
  }

  // ── 2. Add custom preconnect domains ──
  for (const domain of customPreconnect) {
    const href = domain.startsWith('http') ? domain : `https://${domain}`;
    try {
      new URL(href); // validate
      if ($(`link[rel="preconnect"][href="${href}"]`).length === 0) {
        $('head').prepend(`<link rel="preconnect" href="${href}">`);
        console.log(`[hints] Added custom preconnect: ${href}`);
      }
    } catch {
      console.warn(`[hints] Invalid custom preconnect domain: ${domain}`);
    }
  }

  // ── 3. Add custom dns-prefetch domains ──
  for (const domain of customDnsPrefetch) {
    const href = domain.startsWith('http') ? domain : `https://${domain}`;
    try {
      new URL(href);
      if ($(`link[rel="dns-prefetch"][href="${href}"]`).length === 0) {
        $('head').prepend(`<link rel="dns-prefetch" href="${href}">`);
        console.log(`[hints] Added custom dns-prefetch: ${href}`);
      }
    } catch {
      console.warn(`[hints] Invalid custom dns-prefetch domain: ${domain}`);
    }
  }

  // ── 4. Collect all external origins still referenced ──
  const referencedOrigins = new Set<string>();

  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) addOrigin(src, referencedOrigins);
  });

  $('link[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) addOrigin(href, referencedOrigins);
  });

  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) addOrigin(src, referencedOrigins);
  });

  $('img[srcset]').each((_, el) => {
    const srcset = $(el).attr('srcset');
    if (srcset) {
      srcset.split(',').forEach(part => {
        const url = part.trim().split(/\s+/)[0];
        if (url) addOrigin(url, referencedOrigins);
      });
    }
  });

  // ── 2b. Add auto preconnect for detected origins (when enabled) ──
  if (autoPreconnect) {
    const customOrigins = new Set<string>();
    for (const d of customPreconnect) {
      try {
        const href = d.startsWith('http') ? d : `https://${d}`;
        customOrigins.add(new URL(href).origin);
      } catch { /* ignore */ }
    }
    for (const origin of referencedOrigins) {
      if (customOrigins.has(origin)) continue;
      const exists = $(`link[rel="preconnect"]`).filter((_, el) => $(el).attr('href') === origin || $(el).attr('href') === `${origin}/`).length > 0;
      if (!exists) {
        $('head').prepend(`<link rel="preconnect" href="${origin}">`);
        console.log(`[hints] Auto preconnect for ${origin}`);
      }
    }
  }

  // Include custom domains so we don't remove them
  for (const d of customPreconnect) {
    try {
      const href = d.startsWith('http') ? d : `https://${d}`;
      referencedOrigins.add(new URL(href).origin);
    } catch { /* ignore */ }
  }
  for (const d of customDnsPrefetch) {
    try {
      const href = d.startsWith('http') ? d : `https://${d}`;
      referencedOrigins.add(new URL(href).origin);
    } catch { /* ignore */ }
  }

  // ── 5. Remove stale preconnect/dns-prefetch (when enabled) ──
  if (removeUnused) {
    $('link[rel="preconnect"], link[rel="dns-prefetch"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const origin = new URL(href).origin;
        if (!referencedOrigins.has(origin)) {
          $(el).remove();
          console.log(`[hints] Removed stale hint for ${origin}`);
        }
      } catch {
        $(el).remove();
      }
    });
  }

  // ── 6. Remove duplicate hints ──
  const seenHints = new Set<string>();
  $('link[rel="preconnect"], link[rel="dns-prefetch"], link[rel="preload"]').each((_, el) => {
    const key = `${$(el).attr('rel')}|${$(el).attr('href')}`;
    if (seenHints.has(key)) {
      $(el).remove();
    } else {
      seenHints.add(key);
    }
  });

  return $.html();
}

/**
 * Detect the LCP (Largest Contentful Paint) candidate image.
 * Heuristic: First <img> inside <main>, <article>, or <header> with src,
 * or the first <img> overall if none found in those containers.
 */
function detectLcpImage($: cheerio.CheerioAPI): string | null {
  // Priority 1: First image in hero/main content areas
  const heroSelectors = [
    'main img[src]',
    'article img[src]',
    'header img[src]',
    '.hero img[src]',
    '.banner img[src]',
    '[class*="hero"] img[src]',
  ];

  for (const selector of heroSelectors) {
    const img = $(selector).first();
    if (img.length > 0) {
      const src = img.attr('src');
      if (src && !src.startsWith('data:')) {
        // If it's inside a <picture>, prefer the WebP/AVIF source
        const picture = img.closest('picture');
        if (picture.length > 0) {
          const avifSource = picture.find('source[type="image/avif"]').attr('srcset');
          if (avifSource) return avifSource.split(',')[0].trim().split(' ')[0];
          const webpSource = picture.find('source[type="image/webp"]').attr('srcset');
          if (webpSource) return webpSource.split(',')[0].trim().split(' ')[0];
        }
        return src;
      }
    }
  }

  // Priority 2: First <img> on the page
  const firstImg = $('img[src]').first();
  if (firstImg.length > 0) {
    const src = firstImg.attr('src');
    if (src && !src.startsWith('data:')) return src;
  }

  return null;
}

/**
 * Extract origin from a URL and add to the set (only external origins).
 */
function addOrigin(url: string, origins: Set<string>): void {
  try {
    if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('#')) return;
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      origins.add(parsed.origin);
    }
  } catch {
    // Not a valid URL
  }
}
