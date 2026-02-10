import * as cheerio from 'cheerio';

/**
 * Inject resource hints: LCP preload, preconnect for critical origins,
 * cleanup stale dns-prefetch/preconnect hints for removed origins.
 */
export function injectResourceHints(html: string): string {
  const $ = cheerio.load(html);

  // ── 1. Detect LCP candidate and preload it ──
  const lcpImage = detectLcpImage($);
  if (lcpImage) {
    // Check if already preloaded
    const alreadyPreloaded = $(`link[rel="preload"][href="${lcpImage}"]`).length > 0;
    if (!alreadyPreloaded) {
      // Determine the type based on extension
      const isWebp = lcpImage.endsWith('.webp');
      const isAvif = lcpImage.endsWith('.avif');
      const typeAttr = isAvif ? ' type="image/avif"' : isWebp ? ' type="image/webp"' : '';

      $('head').prepend(`<link rel="preload" as="image" href="${lcpImage}"${typeAttr}>`);
      console.log(`[hints] Added preload for LCP image: ${lcpImage}`);
    }
  }

  // ── 2. Collect all external origins still referenced ──
  const referencedOrigins = new Set<string>();

  // Check script sources
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) addOrigin(src, referencedOrigins);
  });

  // Check link hrefs (stylesheets, preloads)
  $('link[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) addOrigin(href, referencedOrigins);
  });

  // Check img sources
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) addOrigin(src, referencedOrigins);
  });

  // ── 3. Remove stale preconnect/dns-prefetch for origins no longer used ──
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
      // Invalid URL, remove it
      $(el).remove();
    }
  });

  // ── 4. Remove duplicate hints ──
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
