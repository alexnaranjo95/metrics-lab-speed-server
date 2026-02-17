import * as cheerio from 'cheerio';
import { WP_CORE_SCRIPT_PATTERNS, WP_CORE_STYLE_PATTERNS, WP_META_SELECTORS, PLUGIN_SCRIPT_PATTERNS, PLUGIN_STYLE_PATTERNS, ANALYTICS_PATTERNS } from './wordpressBloat.js';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

/**
 * Optimize HTML by removing WordPress bloat, plugin assets, and minifying.
 */
export async function optimizeHtml(html: string, settings?: OptimizationSettings): Promise<string> {
  const $ = cheerio.load(html);
  const wpBloat = settings?.html.wpHeadBloat;
  const jsRemove = settings?.js.removeScripts;
  const jsEnabled = settings?.js.enabled !== false;

  if (jsEnabled) {
    removeWordPressCoreScripts($, jsRemove);
    removeWordPressCoreStyles($, jsRemove);
    removeEmojiInlineStyle($, jsRemove);
    removeOembedLinks($, jsRemove);
    removeAdminBarHtmlAndMargin($, jsRemove);
    if (jsRemove?.dashicons) {
      const htmlStr = $.html();
      if (/dashicons-|class="dashicons/i.test(htmlStr)) {
        console.warn('[html] dashicons CSS removed but dashicon classes found in HTML — icons may be missing');
      }
    }
    if (jsRemove?.wpBlockLibrary) removeBlockLibraryCss($);
    if (jsRemove?.wpBlockLibraryTheme) $('link[href*="wp-block-library-theme"]').remove();
    if (jsRemove?.classicThemeStyles) {
      $('link[href*="classic-theme-styles"]').remove();
      $('style#classic-theme-styles-inline-css').remove();
    }
    if (settings?.js.removeJquery && settings?.js.jqueryCompatibilityCheck) {
      let jqueryUsage = false;
      $('script').each((_, el) => {
        const c = $(el).html() || '';
        const src = $(el).attr('src') || '';
        if (/\$\s*\(|jQuery\s*\(|\.ready\s*\(|\.on\s*\(/.test(c)) jqueryUsage = true;
        if (/slick|owl\.carousel|fancybox|magnific|lightbox|select2|datepicker|flexslider|isotope|masonry/i.test(src)) jqueryUsage = true;
      });
      if (jqueryUsage) console.warn('[html] jQuery usage detected but removeJquery is ON — sliders, forms, interactive elements may break');
    }
  }

  removeWordPressMetaTags($, wpBloat);
  removeWordPressDuotoneFilters($);
  removePluginBloat($);
  if (settings?.html.removeAnalytics !== false) removeAnalytics($, settings);

  if (settings?.html.removeElementorDataAttrs !== false) {
    removeElementorDataAttributes($);
  }
  removeGutenbergComments($);
  removeAosDataAttributes($);

  return $.html();
}

function removeWordPressCoreScripts($: cheerio.CheerioAPI, jsRemove?: OptimizationSettings['js']['removeScripts']) {
  for (const pattern of WP_CORE_SCRIPT_PATTERNS) {
    const key = pattern.settingKey as keyof NonNullable<typeof jsRemove>;
    if (jsRemove && key && !jsRemove[key]) continue;
    if (pattern.selector) $(pattern.selector).remove();
    if (pattern.contentMatch) {
      $('script').each((_, el) => {
        if (pattern.contentMatch!.test($(el).html() || '')) $(el).remove();
      });
    }
  }
}

function removeWordPressCoreStyles($: cheerio.CheerioAPI, jsRemove?: OptimizationSettings['js']['removeScripts']) {
  for (const pattern of WP_CORE_STYLE_PATTERNS) {
    const key = pattern.settingKey as keyof NonNullable<typeof jsRemove>;
    if (jsRemove && key && !jsRemove[key]) continue;
    $(pattern.selector).remove();
  }
}

function removeEmojiInlineStyle($: cheerio.CheerioAPI, jsRemove?: OptimizationSettings['js']['removeScripts']) {
  if (jsRemove && !jsRemove.wpEmoji) return;
  $('style').each((_, el) => {
    const css = $(el).html() || '';
    if (/img\.wp-smiley|img\.emoji\s*\{/.test(css)) $(el).remove();
  });
  $('link[rel="dns-prefetch"][href*="s.w.org"]').remove();
}

function removeOembedLinks($: cheerio.CheerioAPI, jsRemove?: OptimizationSettings['js']['removeScripts']) {
  if (jsRemove && !jsRemove.wpEmbed) return;
  $('link[rel="alternate"][type*="oembed"]').remove();
}

function removeAdminBarHtmlAndMargin($: cheerio.CheerioAPI, jsRemove?: OptimizationSettings['js']['removeScripts']) {
  if (jsRemove && !jsRemove.adminBar) return;
  $('#wpadminbar').remove();
  $('body').removeClass('admin-bar');
  $('html').removeClass('admin-bar');
  $('style#admin-bar-inline-css').remove();
  $('style').each((_, el) => {
    const css = $(el).html() || '';
    if (!/margin-top:\s*(32|46)px\s*!important/.test(css)) return;
    const cleaned = css
      .replace(/html\s*\{\s*margin-top:\s*32px\s*!important\s*;?\s*\}/gi, '')
      .replace(/html\s*\{\s*margin-top:\s*46px\s*!important\s*;?\s*\}/gi, '')
      .replace(/@media[^{]+\{[^}]*margin-top:\s*46px\s*!important[^}]*\}/gi, '');
    if (cleaned.trim().length < 30) $(el).remove();
    else $(el).html(cleaned);
  });
}

function removeWordPressMetaTags($: cheerio.CheerioAPI, wpBloat?: OptimizationSettings['html']['wpHeadBloat']) {
  const selectorChecks: Record<string, keyof NonNullable<typeof wpBloat>> = {
    'link[rel="EditURI"]': 'editUri',
    'link[rel="wlwmanifest"]': 'wlwmanifest',
    'meta[name="generator"]': 'metaGenerator',
    'link[rel="shortlink"]': 'shortlink',
    'link[rel="alternate"][type*="rss"]': 'rssFeedLinks',
    'link[rel="dns-prefetch"][href*="s.w.org"]': 'dnsPrefetchWpOrg',
    'link[rel="https://api.w.org/"]': 'apiWpOrg',
    'link[rel="alternate"][type*="oembed"]': 'oembedDiscovery',
  };

  for (const selector of WP_META_SELECTORS) {
    const settingKey = selectorChecks[selector];
    if (wpBloat && settingKey && !wpBloat[settingKey]) continue;
    $(selector).remove();
  }

  // pingback
  if (!wpBloat || wpBloat.pingback) {
    $('link[rel="pingback"]').remove();
  }

  // commentsFeedLink
  if (!wpBloat || wpBloat.commentsFeedLink) {
    $('link').each((_, el) => {
      const href = $(el).attr('href') || '';
      const title = $(el).attr('title') || '';
      if (href.includes('comments/feed') || title.toLowerCase().includes('comments feed')) {
        $(el).remove();
      }
    });
  }

  // prevNextLinks
  if (!wpBloat || wpBloat.prevNextLinks) {
    $('link[rel="prev"]').remove();
    $('link[rel="next"]').remove();
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
 * Remove Elementor data-* attributes that add ~50KB+ of dead weight.
 */
function removeElementorDataAttributes($: cheerio.CheerioAPI) {
  const ELEMENTOR_ATTRS = [
    'data-elementor-id',
    'data-elementor-type',
    'data-elementor-settings',
    'data-elementor-model-cid',
    'data-elementor-column-size',
    'data-elementor-column-gap',
    'data-elementor-post-type',
  ];

  for (const attr of ELEMENTOR_ATTRS) {
    $(`[${attr}]`).removeAttr(attr);
  }
}

/**
 * Remove Gutenberg block comments: <!-- wp:heading --> ... <!-- /wp:heading -->
 * Also removes Elementor HTML comments.
 */
function removeGutenbergComments($: cheerio.CheerioAPI) {
  const html = $.html();
  const cleaned = html
    .replace(/<!--\s*\/?wp:[a-z][a-z0-9/-]*(?:\s+\{[^}]*\})?\s*-->/gi, '')
    .replace(/<!--\s*Elementor[^-]*-->/gi, '')
    .replace(/<!--\s*\/Elementor[^-]*-->/gi, '');

  if (cleaned !== html) {
    const $new = cheerio.load(cleaned);
    $('html').replaceWith($new('html'));
  }
}

/**
 * Remove AOS (Animate on Scroll) data attributes when AOS.js has been removed.
 */
function removeAosDataAttributes($: cheerio.CheerioAPI) {
  // Only remove if AOS.js is not present in the page
  const hasAos = $('script[src*="aos"]').length > 0 ||
    $('script').filter((_, el) => ($(el).html() || '').includes('AOS.init')).length > 0;

  if (hasAos) return;

  const AOS_ATTRS = ['data-aos', 'data-aos-delay', 'data-aos-duration', 'data-aos-easing', 'data-aos-once', 'data-aos-offset'];
  for (const attr of AOS_ATTRS) {
    $(`[${attr}]`).removeAttr(attr);
  }
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

function removeAnalytics($: cheerio.CheerioAPI, settings?: OptimizationSettings) {
  if (settings?.html.removeAnalytics === false) return;

  const isMetricsLab = (s: string) => /metricslab|metrics-lab/i.test(s);

  // External scripts — never remove Metrics Lab
  for (const pattern of ANALYTICS_PATTERNS.scripts) {
    $(pattern).each((_, el) => {
      const src = $(el).attr('src') || '';
      if (!isMetricsLab(src)) $(el).remove();
    });
  }

  // Inline scripts — never remove Metrics Lab
  $('script:not([src])').each((_, el) => {
    const content = $(el).html() || '';
    if (isMetricsLab(content)) return;
    for (const p of ANALYTICS_PATTERNS.inlinePatterns) {
      if (p.test(content)) { $(el).remove(); return; }
    }
    if (/window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]/.test(content) && /gtag\s*\(/.test(content)) {
      $(el).remove();
      return;
    }
    if (/hotjar\.com|hj\s*\(/.test(content) || /clarity\.ms|window\.clarity/.test(content)) {
      $(el).remove();
    }
  });

  // GTM noscript fallback
  $('noscript').each((_, el) => {
    const content = $(el).html() || '';
    if (/googletagmanager/i.test(content)) $(el).remove();
  });
}
