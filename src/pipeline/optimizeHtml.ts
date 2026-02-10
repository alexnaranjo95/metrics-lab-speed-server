import * as cheerio from 'cheerio';
import { WP_CORE_SCRIPT_PATTERNS, WP_CORE_STYLE_PATTERNS, WP_META_SELECTORS, PLUGIN_SCRIPT_PATTERNS, PLUGIN_STYLE_PATTERNS, ANALYTICS_PATTERNS } from './wordpressBloat.js';

/**
 * Optimize HTML by removing WordPress bloat, plugin assets, and minifying.
 */
export async function optimizeHtml(html: string): Promise<string> {
  const $ = cheerio.load(html);

  // ── 1. WordPress Core Bloat Removal ──
  removeWordPressCoreScripts($);
  removeWordPressCoreStyles($);
  removeWordPressMetaTags($);
  removeWordPressDuotoneFilters($);

  // ── 2. Plugin Bloat Removal (conditional) ──
  removePluginBloat($);

  // ── 3. Analytics Removal (always) ──
  removeAnalytics($);

  // ── 4. HTML Minification ──
  let output = $.html();
  output = minifyHtml(output);

  return output;
}

function removeWordPressCoreScripts($: cheerio.CheerioAPI) {
  for (const pattern of WP_CORE_SCRIPT_PATTERNS) {
    if (pattern.selector) {
      $(pattern.selector).remove();
    }
    if (pattern.contentMatch) {
      $('script').each((_, el) => {
        const content = $(el).html() || '';
        if (pattern.contentMatch!.test(content)) {
          $(el).remove();
        }
      });
    }
  }
}

function removeWordPressCoreStyles($: cheerio.CheerioAPI) {
  for (const pattern of WP_CORE_STYLE_PATTERNS) {
    $(pattern.selector).remove();
  }
}

function removeWordPressMetaTags($: cheerio.CheerioAPI) {
  for (const selector of WP_META_SELECTORS) {
    $(selector).remove();
  }
}

function removeWordPressDuotoneFilters($: cheerio.CheerioAPI) {
  $('svg').each((_, el) => {
    const svgHtml = $(el).html() || '';
    if (svgHtml.includes('wp-duotone-')) {
      $(el).remove();
    }
  });
}

function removePluginBloat($: cheerio.CheerioAPI) {
  // WooCommerce cart fragments — ALWAYS remove (fires AJAX to dead endpoint on static)
  $('script[src*="cart-fragments"]').remove();

  // WooCommerce (if no .woocommerce elements on page)
  if ($('.woocommerce').length === 0) {
    for (const pattern of PLUGIN_SCRIPT_PATTERNS.woocommerce) {
      $(pattern).remove();
    }
    for (const pattern of PLUGIN_STYLE_PATTERNS.woocommerce) {
      $(pattern).remove();
    }
  }

  // Contact Form 7 (if no .wpcf7 elements on page)
  if ($('.wpcf7').length === 0) {
    for (const pattern of PLUGIN_SCRIPT_PATTERNS.contactForm7) {
      $(pattern).remove();
    }
    for (const pattern of PLUGIN_STYLE_PATTERNS.contactForm7) {
      $(pattern).remove();
    }
  }

  // Elementor (if no .elementor elements on page)
  if ($('.elementor').length === 0) {
    for (const pattern of PLUGIN_SCRIPT_PATTERNS.elementor) {
      $(pattern).remove();
    }
    for (const pattern of PLUGIN_STYLE_PATTERNS.elementor) {
      $(pattern).remove();
    }
  }

  // Slider Revolution (if no .rev_slider on page)
  if ($('.rev_slider').length === 0) {
    for (const pattern of PLUGIN_SCRIPT_PATTERNS.sliderRevolution) {
      $(pattern).remove();
    }
    for (const pattern of PLUGIN_STYLE_PATTERNS.sliderRevolution) {
      $(pattern).remove();
    }
  }
}

function removeAnalytics($: cheerio.CheerioAPI) {
  // Remove analytics script tags
  for (const pattern of ANALYTICS_PATTERNS.scripts) {
    $(pattern).remove();
  }

  // Remove inline analytics scripts
  $('script').each((_, el) => {
    const content = $(el).html() || '';
    for (const inlinePattern of ANALYTICS_PATTERNS.inlinePatterns) {
      if (inlinePattern.test(content)) {
        $(el).remove();
        return;
      }
    }
  });
}

function minifyHtml(html: string): string {
  // Remove HTML comments (except conditional comments)
  html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');

  // Collapse whitespace between tags
  html = html.replace(/>\s+</g, '><');

  // Remove unnecessary attributes
  html = html.replace(/\s+type="text\/javascript"/g, '');
  html = html.replace(/\s+type="text\/css"/g, '');

  // Collapse multiple whitespace in text nodes to single spaces
  html = html.replace(/\s{2,}/g, ' ');

  return html.trim();
}
