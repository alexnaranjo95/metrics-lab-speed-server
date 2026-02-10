import * as cheerio from 'cheerio';
import { minify as htmlMinify } from 'html-minifier-terser';
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
  removeGutenbergComments($);
  removeBlockLibraryCss($);

  // ── 2. Plugin Bloat Removal (conditional) ──
  removePluginBloat($);

  // ── 3. Analytics Removal (always) ──
  removeAnalytics($);

  // ── 4. HTML Minification with html-minifier-terser ──
  let output = $.html();
  output = await minifyHtml(output);

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

/**
 * Remove Gutenberg block comments: <!-- wp:heading --> ... <!-- /wp:heading -->
 */
function removeGutenbergComments($: cheerio.CheerioAPI) {
  // Cheerio doesn't directly expose comments easily, so we'll handle
  // this in the final minification step (html-minifier-terser removes all comments).
  // But we also do a regex pass for safety.
}

/**
 * Remove wp-block-library CSS if no Gutenberg block classes are detected.
 */
function removeBlockLibraryCss($: cheerio.CheerioAPI) {
  // Check if page actually uses block classes
  const htmlContent = $.html();
  const usesBlocks = /class="[^"]*wp-block-/i.test(htmlContent);

  if (!usesBlocks) {
    $('link[href*="wp-block-library"]').remove();
    $('style#wp-block-library-inline-css').remove();
    $('link[href*="block-library"]').remove();
  }
}

function removePluginBloat($: cheerio.CheerioAPI) {
  // WooCommerce cart fragments — ALWAYS remove
  $('script[src*="cart-fragments"]').remove();

  // WooCommerce (if no .woocommerce elements)
  if ($('.woocommerce').length === 0) {
    for (const pattern of PLUGIN_SCRIPT_PATTERNS.woocommerce) $(pattern).remove();
    for (const pattern of PLUGIN_STYLE_PATTERNS.woocommerce) $(pattern).remove();
  }

  // Contact Form 7 (if no .wpcf7 elements)
  if ($('.wpcf7').length === 0) {
    for (const pattern of PLUGIN_SCRIPT_PATTERNS.contactForm7) $(pattern).remove();
    for (const pattern of PLUGIN_STYLE_PATTERNS.contactForm7) $(pattern).remove();
  }

  // Elementor (if no .elementor elements)
  if ($('.elementor').length === 0) {
    for (const pattern of PLUGIN_SCRIPT_PATTERNS.elementor) $(pattern).remove();
    for (const pattern of PLUGIN_STYLE_PATTERNS.elementor) $(pattern).remove();
  }

  // Slider Revolution (if no .rev_slider)
  if ($('.rev_slider').length === 0) {
    for (const pattern of PLUGIN_SCRIPT_PATTERNS.sliderRevolution) $(pattern).remove();
    for (const pattern of PLUGIN_STYLE_PATTERNS.sliderRevolution) $(pattern).remove();
  }
}

function removeAnalytics($: cheerio.CheerioAPI) {
  for (const pattern of ANALYTICS_PATTERNS.scripts) {
    $(pattern).remove();
  }
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

/**
 * Robust HTML minification using html-minifier-terser.
 * Handles edge cases much better than regex-based minification.
 */
async function minifyHtml(html: string): Promise<string> {
  try {
    const minified = await htmlMinify(html, {
      collapseWhitespace: true,
      removeComments: true,              // Removes ALL comments including Gutenberg <!-- wp:... -->
      removeRedundantAttributes: true,    // Remove type="text/javascript" etc.
      removeEmptyAttributes: true,
      removeOptionalTags: false,          // Keep <html>, <head>, <body> tags
      minifyCSS: true,                    // Minify inline CSS
      minifyJS: true,                     // Minify inline JS
      sortAttributes: true,
      sortClassName: true,
      collapseBooleanAttributes: true,    // checked="" → checked
      decodeEntities: true,
      processConditionalComments: true,
      removeAttributeQuotes: false,       // Keep quotes for safety
      removeScriptTypeAttributes: true,   // Remove type="text/javascript"
      removeStyleLinkTypeAttributes: true, // Remove type="text/css"
    });
    return minified;
  } catch (err) {
    console.warn('[html] html-minifier-terser failed, using basic minification:', (err as Error).message);
    // Fallback: basic regex minification
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    html = html.replace(/>\s+</g, '><');
    html = html.replace(/\s{2,}/g, ' ');
    return html.trim();
  }
}
