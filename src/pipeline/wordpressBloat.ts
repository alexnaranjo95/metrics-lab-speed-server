/**
 * WordPress-specific bloat patterns for detection and removal.
 */

export interface ScriptPattern {
  selector?: string;
  contentMatch?: RegExp;
}

// ── WordPress Core Scripts to Remove ──
export const WP_CORE_SCRIPT_PATTERNS: ScriptPattern[] = [
  { selector: 'script[src*="wp-emoji-release.min.js"]' },
  { selector: 'script[src*="jquery-migrate.min.js"]' },
  { selector: 'script[src*="wp-embed.min.js"]' },
  { selector: 'script[src*="wp-polyfill.min.js"]' },
  { selector: 'script[src*="comment-reply.min.js"]' },
  // Inline emoji detection script
  { contentMatch: /window\._wpemojiSettings/ },
];

// ── WordPress Core Styles to Remove ──
export const WP_CORE_STYLE_PATTERNS = [
  { selector: 'link[href*="admin-bar.min.css"]' },
  { selector: 'link[href*="dashicons.min.css"]' },
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
