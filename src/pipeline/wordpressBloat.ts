/**
 * WordPress-specific bloat patterns for detection and removal.
 */

export interface ScriptPattern {
  selector?: string;
  contentMatch?: RegExp;
  settingKey?: string;
}

// ── WordPress Core Scripts to Remove (per setting) ──
export const WP_CORE_SCRIPT_PATTERNS: ScriptPattern[] = [
  { selector: 'script[src*="wp-emoji"]', settingKey: 'wpEmoji' },
  { selector: 'script[src*="twemoji"]', settingKey: 'wpEmoji' },
  { contentMatch: /window\._wpemojiSettings|wp\.emoji/, settingKey: 'wpEmoji' },
  { selector: 'script[src*="wp-embed"]', settingKey: 'wpEmbed' },
  { contentMatch: /wp\.receiveEmbedMessage|window\._wpEmbedSettings/, settingKey: 'wpEmbed' },
  { selector: 'script[src*="jquery-migrate"]', settingKey: 'jqueryMigrate' },
  { selector: 'script[src*="comment-reply"]', settingKey: 'commentReply' },
  { selector: 'script[src*="wp-polyfill"]', settingKey: 'wpPolyfill' },
  { selector: 'script[src*="regenerator-runtime"]', settingKey: 'wpPolyfill' },
  { selector: 'script[src*="hoverintent"]', settingKey: 'hoverIntent' },
  { selector: 'script[src*="hoverIntent"]', settingKey: 'hoverIntent' },
  { selector: 'script[src*="admin-bar"]', settingKey: 'adminBar' },
  { selector: 'script[src*="blocks.min.js"]', settingKey: 'gutenbergBlocks' },
  { selector: 'script[src*="element.min.js"]', settingKey: 'gutenbergBlocks' },
  { selector: 'script[src*="wp-block-editor"]', settingKey: 'gutenbergBlocks' },
  { selector: 'script[src*="wp-edit-blocks"]', settingKey: 'gutenbergBlocks' },
];

// ── WordPress Core Styles to Remove ──
export const WP_CORE_STYLE_PATTERNS: Array<{ selector: string; contentMatch?: RegExp; settingKey?: string }> = [
  { selector: 'link[href*="admin-bar"]', settingKey: 'adminBar' },
  { selector: 'link[href*="dashicons"]', settingKey: 'dashicons' },
  { selector: 'link[href*="wp-block-library/style"]', settingKey: 'wpBlockLibrary' },
  { selector: 'link[href*="block-library/style"]', settingKey: 'wpBlockLibrary' },
  { selector: 'link[href*="wp-block-library-theme"]', settingKey: 'wpBlockLibraryTheme' },
  { selector: 'style#wp-block-library-inline-css', settingKey: 'wpBlockLibrary' },
  { selector: 'style#classic-theme-styles-inline-css', settingKey: 'classicThemeStyles' },
  { selector: 'link[href*="classic-theme-styles"]', settingKey: 'classicThemeStyles' },
];

// ── WordPress Meta Tags / Link Elements to Remove ──
export const WP_META_SELECTORS = [
  'link[rel="EditURI"]',
  'link[rel="wlwmanifest"]',
  'meta[name="generator"]',
  'link[rel="shortlink"]',
  'link[rel="alternate"][type*="rss"]',
  'link[rel="dns-prefetch"][href*="s.w.org"]',
  'link[rel="https://api.w.org/"]',
  'link[rel="alternate"][type*="oembed"]',
];

// ── Plugin Script Patterns (conditional removal) ──
export const PLUGIN_SCRIPT_PATTERNS: Record<string, string[]> = {
  woocommerce: [
    'script[src*="plugins/woocommerce/assets"]',
    'script[src*="cart-fragments"]',
  ],
  contactForm7: [
    'script[src*="plugins/contact-form-7"]',
  ],
  elementor: [
    'script[src*="plugins/elementor/assets"]',
  ],
  sliderRevolution: [
    'script[src*="plugins/revslider"]',
  ],
};

// ── Plugin Style Patterns (conditional removal) ──
export const PLUGIN_STYLE_PATTERNS: Record<string, string[]> = {
  woocommerce: [
    'link[href*="plugins/woocommerce/assets"]',
  ],
  contactForm7: [
    'link[href*="plugins/contact-form-7"]',
  ],
  elementor: [
    'link[href*="plugins/elementor/assets"]',
  ],
  sliderRevolution: [
    'link[href*="plugins/revslider"]',
  ],
};

// ── Analytics Patterns (always remove) ──
export const ANALYTICS_PATTERNS = {
  scripts: [
    'script[src*="googletagmanager.com/gtag"]',
    'script[src*="google-analytics.com/analytics.js"]',
    'script[src*="googletagmanager.com/gtm.js"]',
    'script[src*="google-analytics-for-wordpress"]',
  ],
  inlinePatterns: [
    /gtag\s*\(/,
    /__gaTracker/,
    /GoogleAnalyticsObject/,
    /google-analytics\.com\/analytics/,
  ] as RegExp[],
};
