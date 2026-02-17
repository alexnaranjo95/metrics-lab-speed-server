/**
 * ResourceHintInjector — Injects optimized resource hints into <head>
 * in priority order to maximize parallel downloading.
 *
 * Priority order:
 * 1. DNS prefetch for remaining external origins
 * 2. Preconnect for CF Stream (if videos exist)
 * 3. Background video poster preload
 * 4. Hero image preload
 * 5. Site logo preload
 * 6. Primary font preload
 * 7. Critical CSS (inline <style>)
 * 8. Non-blocking full CSS loader
 * 9. Click-to-play video poster preload
 */

import type { CheerioAPI } from 'cheerio';
import { config } from '../../config.js';

export interface ResourceHintOptions {
  hasBackgroundVideo: boolean;
  bgVideoPosterUrl?: string;
  hasCfStreamVideos: boolean;
  primaryFontPath?: string;
  criticalCssFilePaths?: string[];
}

/**
 * Inject priority-ordered resource hints into <head>.
 * Call this AFTER all other optimizations have been applied.
 */
export function injectResourceHints(
  $: CheerioAPI,
  options: ResourceHintOptions
): void {
  const head = $('head').first();
  if (!head.length) return;

  // Remove all existing preconnect/dns-prefetch (we rebuild from scratch)
  $('link[rel="preconnect"], link[rel="dns-prefetch"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    // Keep preconnects we didn't add (user-defined)
    if (!href.includes('fonts.googleapis.com') && !href.includes('fonts.gstatic.com') &&
        !href.includes('i.ytimg.com') && !href.includes('youtube.com')) {
      return;
    }
    $(el).remove();
  });

  const hints: string[] = [];

  // ── Position 1: DNS prefetch for remaining external origins ──
  const externalOrigins = collectExternalOrigins($);
  for (const origin of externalOrigins) {
    hints.push(`<link rel="dns-prefetch" href="${origin}">`);
  }

  // ── Position 2: Preconnect for CF Stream ──
  if (options.hasCfStreamVideos) {
    const subdomain = (config as any).CF_STREAM_CUSTOMER_SUBDOMAIN;
    if (subdomain) {
      hints.push(`<link rel="preconnect" href="https://customer-${subdomain}.cloudflarestream.com">`);
    }
  }

  // ── Position 3: Background video poster preload ──
  if (options.bgVideoPosterUrl) {
    hints.push(`<link rel="preload" href="${options.bgVideoPosterUrl}" as="image" media="(min-width: 768px)" fetchpriority="high">`);
  }

  // ── Position 4: Hero image preload ──
  const heroImage = detectHeroImage($);
  if (heroImage) {
    // Don't duplicate if already preloaded by earlier step
    if ($(`link[rel="preload"][href="${heroImage}"]`).length === 0) {
      hints.push(`<link rel="preload" href="${heroImage}" as="image" fetchpriority="high">`);
    }
  }

  // ── Position 5: Site logo preload ──
  const logoSrc = detectLogo($);
  if (logoSrc && logoSrc !== heroImage) {
    if ($(`link[rel="preload"][href="${logoSrc}"]`).length === 0) {
      hints.push(`<link rel="preload" href="${logoSrc}" as="image" fetchpriority="high">`);
    }
  }

  // ── Position 6: Primary font preload ──
  if (options.primaryFontPath) {
    hints.push(`<link rel="preload" href="${options.primaryFontPath}" as="font" type="font/woff2" crossorigin>`);
  }

  // ── Position 9: Click-to-play video poster preload ──
  const videoPoster = detectFirstVideoPoster($);
  if (videoPoster) {
    if ($(`link[rel="preload"][href="${videoPoster}"]`).length === 0) {
      const isAboveFold = isElementAboveFold($, $(`img[src="${videoPoster}"]`).first());
      hints.push(`<link rel="preload" href="${videoPoster}" as="image" fetchpriority="${isAboveFold ? 'high' : 'auto'}">`);
    }
  }

  // Remove existing preload tags that we're re-injecting with proper ordering
  $('link[rel="preload"][as="image"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (hints.some(h => h.includes(href))) {
      $(el).remove();
    }
  });

  // Inject all hints at the TOP of <head> in priority order
  if (hints.length > 0) {
    const firstChild = head.children().first();
    if (firstChild.length) {
      firstChild.before(hints.join('\n') + '\n');
    } else {
      head.append(hints.join('\n') + '\n');
    }
  }
}

function collectExternalOrigins($: CheerioAPI): Set<string> {
  const origins = new Set<string>();

  $('script[src], link[href], img[src]').each((_, el) => {
    const url = $(el).attr('src') || $(el).attr('href') || '';
    try {
      if (url.startsWith('http') || url.startsWith('//')) {
        const parsed = new URL(url.startsWith('//') ? `https:${url}` : url);
        if (parsed.hostname !== 'imagedelivery.net' && !parsed.hostname.includes('cloudflare')) {
          origins.add(parsed.origin);
        }
      }
    } catch { /* ignore invalid */ }
  });

  return origins;
}

function detectHeroImage($: CheerioAPI): string | null {
  const heroSelectors = [
    '.hero img[src]', '[class*="hero"] img[src]',
    '.banner img[src]', '[class*="banner"] img[src]',
    'header img[src]', '[class*="header"] img[src]',
    '.intro img[src]', '.jumbotron img[src]',
    '.masthead img[src]', '.splash img[src]',
    '.cover img[src]', '.featured img[src]',
    'main img[src]', 'article img[src]',
  ];

  for (const selector of heroSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const src = el.attr('src');
      const width = parseInt(el.attr('width') || '0', 10);
      if (src && !src.startsWith('data:') && (width === 0 || width > 300)) {
        return src;
      }
    }
  }

  // Fallback: first large image
  let result: string | null = null;
  $('img[src]').each((_, el) => {
    if (result) return;
    const src = $(el).attr('src') || '';
    const width = parseInt($(el).attr('width') || '0', 10);
    if (!src.startsWith('data:') && width > 600) {
      result = src;
    }
  });

  return result;
}

function detectLogo($: CheerioAPI): string | null {
  const logoSelectors = [
    'header img[class*="logo"]', 'header img[alt*="logo" i]',
    'img[class*="logo"]', 'img[id*="logo"]',
    '.site-logo img[src]', '.custom-logo',
    'a[class*="logo"] img[src]',
  ];

  for (const selector of logoSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const src = el.attr('src');
      if (src && !src.startsWith('data:')) return src;
    }
  }
  return null;
}

function detectFirstVideoPoster($: CheerioAPI): string | null {
  const poster = $('.ml-video-facade .ml-poster-img, .ml-video-facade img').first();
  if (poster.length) return poster.attr('src') || null;
  return null;
}

function isElementAboveFold($: CheerioAPI, el: any): boolean {
  if (!$(el).length) return false;
  return $(el).closest('header, .hero, [class*="hero"], .banner, main').length > 0;
}
