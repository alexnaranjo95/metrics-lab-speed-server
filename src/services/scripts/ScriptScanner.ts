/**
 * ScriptScanner — Structured discovery and classification of all JavaScript
 * in a page's HTML before processing.
 *
 * Returns ScriptRecord[] with per-script classification:
 * isWordPress, isThirdParty, isDeadCode, suggestedLoading.
 */

import crypto from 'crypto';
import type { CheerioAPI } from 'cheerio';

export interface ScriptRecord {
  id: string;
  type: 'external' | 'inline' | 'module';
  src: string | null;
  content: string | null;
  isInHead: boolean;
  isWordPress: boolean;
  isThirdParty: boolean;
  isDeadCode: boolean;
  suggestedLoading: 'defer' | 'async' | 'inline' | 'remove';
  elementIndex: number;
}

// WordPress dead code patterns — scripts that serve no purpose in static output
const WP_DEAD_CODE_SRC_PATTERNS = [
  /wp-includes\/js\/wp-embed/i,
  /wp-includes\/js\/wp-emoji/i,
  /wp-includes\/js\/comment-reply/i,
  /wp-includes\/js\/jquery\/jquery\.js$/i, // full jquery (not .min.js)
  /\/wp-admin/i,
  /admin-ajax\.php/i,
  /elementor\/assets\/js\/frontend(?!-modules)/i,
  /elementor\/assets\/js\/preloaded-modules/i,
  /wp-content\/plugins\/[^/]+\/admin/i,
];

const WP_DEAD_CODE_INLINE_PATTERNS = [
  /admin-ajax\.php/,
  /wp_ajax/,
  /elementorFrontendConfig/,
  /ElementorProFrontendConfig/,
  /wpApiSettings/,
  /wc_cart_params/,
  /wc_add_to_cart_params/,
  /\/wp-json\//,
];

// Third-party script domains
const THIRD_PARTY_DOMAINS = [
  'googletagmanager.com', 'google-analytics.com', 'analytics.google.com',
  'connect.facebook.net', 'static.hotjar.com', 'script.hotjar.com',
  'js.hs-scripts.com', 'js.hsforms.net',
  'widget.intercom.io', 'js.intercomcdn.com',
  'cdn.segment.com', 'js.driftt.com', 'tawk.to',
  'cdn.lr-ingest.com', 'snap.licdn.com', 'bat.bing.com',
  'static.ads-twitter.com', 'app.termly.io', 'cdn.cookielaw.org',
  'assets.calendly.com', 'embed.typeform.com',
  'wchat.freshchat.com', 'widget.freshworks.com',
];

const WP_SRC_PATTERN = /\/wp-(?:includes|content)\//i;

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Scan all <script> elements in the HTML and classify each one.
 */
export function scanScripts($: CheerioAPI): ScriptRecord[] {
  const records: ScriptRecord[] = [];
  let index = 0;

  $('script').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || null;
    const content = src ? null : ($el.html() || '').trim() || null;
    const typeAttr = $el.attr('type') || '';
    const isModule = typeAttr === 'module';
    const isInHead = $el.closest('head').length > 0;

    // Skip non-JS types (templates, JSON-LD, etc.)
    if (typeAttr && typeAttr !== 'text/javascript' && typeAttr !== 'module' && typeAttr !== 'application/javascript') {
      index++;
      return;
    }

    const id = src ? md5(src) : content ? md5(content) : md5(`inline-${index}`);
    const type = isModule ? 'module' : src ? 'external' : 'inline';

    const isWordPress = src ? WP_SRC_PATTERN.test(src) : false;
    const isThirdParty = src ? isThirdPartyDomain(src) : false;

    let isDeadCode = false;
    let suggestedLoading: ScriptRecord['suggestedLoading'] = 'defer';

    // Check external scripts for dead code patterns
    if (src) {
      for (const pattern of WP_DEAD_CODE_SRC_PATTERNS) {
        if (pattern.test(src)) {
          isDeadCode = true;
          suggestedLoading = 'remove';
          break;
        }
      }
    }

    // Check inline scripts for dead code patterns
    if (!src && content) {
      for (const pattern of WP_DEAD_CODE_INLINE_PATTERNS) {
        if (pattern.test(content)) {
          isDeadCode = true;
          suggestedLoading = 'remove';
          break;
        }
      }

      // Keep useful inline data that isn't WP-specific
      if (!isDeadCode) {
        suggestedLoading = 'inline';
      }
    }

    // Third-party scripts: mark for removal (handled by ThirdPartyDetector)
    if (isThirdParty) {
      suggestedLoading = 'remove';
    }

    // Respect intentional sync markers
    if (src && !isDeadCode && !isThirdParty) {
      const dataSync = $el.attr('data-cfasync');
      if (typeAttr === 'text/template' || dataSync === 'false') {
        suggestedLoading = 'inline'; // keep as-is
      }
    }

    records.push({
      id,
      type,
      src,
      content,
      isInHead,
      isWordPress,
      isThirdParty,
      isDeadCode,
      suggestedLoading,
      elementIndex: index,
    });

    index++;
  });

  return records;
}

function isThirdPartyDomain(src: string): boolean {
  try {
    const hostname = new URL(src, 'https://placeholder.com').hostname;
    return THIRD_PARTY_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return THIRD_PARTY_DOMAINS.some(domain => src.includes(domain));
  }
}

/**
 * Get summary stats from scan results.
 */
export function getScriptSummary(records: ScriptRecord[]) {
  return {
    total: records.length,
    external: records.filter(r => r.type === 'external').length,
    inline: records.filter(r => r.type === 'inline').length,
    deadCode: records.filter(r => r.isDeadCode).length,
    thirdParty: records.filter(r => r.isThirdParty).length,
    wordpress: records.filter(r => r.isWordPress).length,
  };
}
