/**
 * ThirdPartyDetector — Identifies third-party tracking/marketing tools
 * present on a page, extracts tracking IDs, and determines which can
 * be replaced by Cloudflare Zaraz.
 */

import type { ScriptRecord } from './ScriptScanner.js';

export interface DetectedTool {
  name: string;
  category: 'analytics' | 'advertising' | 'chat' | 'heatmap' | 'forms' | 'consent' | 'other';
  scriptSrc: string;
  trackingId: string | null;
  zarazSupported: boolean;
  zarazToolName: string;
  payloadKb: number;
}

export interface ThirdPartyReport {
  detectedTools: DetectedTool[];
  zarazConfigSpec: Array<{ toolName: string; trackingId: string | null }>;
  removedScriptCount: number;
  estimatedPayloadSavedKb: number;
}

interface ToolSignature {
  name: string;
  category: DetectedTool['category'];
  zarazToolName: string;
  zarazSupported: boolean;
  payloadKb: number;
  srcPatterns: RegExp[];
  inlinePatterns: RegExp[];
  idExtractors: RegExp[];
}

const TOOL_SIGNATURES: ToolSignature[] = [
  {
    name: 'Google Analytics 4',
    category: 'analytics',
    zarazToolName: 'Google Analytics 4',
    zarazSupported: true,
    payloadKb: 50,
    srcPatterns: [/googletagmanager\.com\/gtag\/js/i],
    inlinePatterns: [/gtag\(\s*['"]config['"]\s*,\s*['"]G-/i],
    idExtractors: [/G-[A-Z0-9]+/],
  },
  {
    name: 'Facebook Pixel',
    category: 'advertising',
    zarazToolName: 'Facebook Pixel',
    zarazSupported: true,
    payloadKb: 100,
    srcPatterns: [/connect\.facebook\.net.*fbevents/i],
    inlinePatterns: [/fbq\(\s*['"]init['"]/i],
    idExtractors: [/fbq\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/],
  },
  {
    name: 'Google Ads',
    category: 'advertising',
    zarazToolName: 'Google Ads',
    zarazSupported: true,
    payloadKb: 40,
    srcPatterns: [/googletagmanager\.com\/gtag\/js/i],
    inlinePatterns: [/gtag\(\s*['"]config['"]\s*,\s*['"]AW-/i],
    idExtractors: [/AW-[0-9]+/],
  },
  {
    name: 'HubSpot',
    category: 'analytics',
    zarazToolName: 'HubSpot',
    zarazSupported: true,
    payloadKb: 300,
    srcPatterns: [/js\.hs-scripts\.com/i, /hs-analytics\.net/i],
    inlinePatterns: [],
    idExtractors: [/hs-scripts\.com\/(\d+)\.js/],
  },
  {
    name: 'LinkedIn Insight Tag',
    category: 'advertising',
    zarazToolName: 'LinkedIn Insight Tag',
    zarazSupported: true,
    payloadKb: 30,
    srcPatterns: [/snap\.licdn\.com\/li\.lms-analytics/i],
    inlinePatterns: [/_linkedin_partner_id/i],
    idExtractors: [/_linkedin_partner_id\s*=\s*["'](\d+)["']/],
  },
  {
    name: 'Hotjar',
    category: 'heatmap',
    zarazToolName: 'Hotjar',
    zarazSupported: true,
    payloadKb: 200,
    srcPatterns: [/static\.hotjar\.com/i, /script\.hotjar\.com/i],
    inlinePatterns: [/hjid\s*:\s*\d+/i, /hj\s*\(\s*['"]init['"]/i],
    idExtractors: [/hjid\s*:\s*(\d+)/],
  },
  {
    name: 'Bing Ads',
    category: 'advertising',
    zarazToolName: 'Bing',
    zarazSupported: true,
    payloadKb: 30,
    srcPatterns: [/bat\.bing\.com\/bat\.js/i],
    inlinePatterns: [/uetq/i],
    idExtractors: [/uetq.*ti\s*:\s*["'](\d+)["']/],
  },
  {
    name: 'Intercom',
    category: 'chat',
    zarazToolName: 'Custom HTTP Action',
    zarazSupported: false,
    payloadKb: 300,
    srcPatterns: [/widget\.intercom\.io/i, /js\.intercomcdn\.com/i],
    inlinePatterns: [/window\.Intercom/i, /intercomSettings/i],
    idExtractors: [/app_id\s*:\s*['"]([^'"]+)['"]/],
  },
  {
    name: 'Calendly',
    category: 'forms',
    zarazToolName: '',
    zarazSupported: false,
    payloadKb: 400,
    srcPatterns: [/assets\.calendly\.com/i],
    inlinePatterns: [/Calendly\.initPopupWidget/i, /Calendly\.initInlineWidget/i],
    idExtractors: [],
  },
  {
    name: 'Drift',
    category: 'chat',
    zarazToolName: 'Custom HTTP Action',
    zarazSupported: false,
    payloadKb: 250,
    srcPatterns: [/js\.driftt\.com/i],
    inlinePatterns: [/drift\.load/i],
    idExtractors: [/drift\.load\s*\(\s*['"]([^'"]+)['"]/],
  },
  {
    name: 'Tawk.to',
    category: 'chat',
    zarazToolName: 'Custom HTTP Action',
    zarazSupported: false,
    payloadKb: 200,
    srcPatterns: [/embed\.tawk\.to/i],
    inlinePatterns: [/Tawk_API/i],
    idExtractors: [],
  },
  {
    name: 'Segment',
    category: 'analytics',
    zarazToolName: 'Segment',
    zarazSupported: true,
    payloadKb: 80,
    srcPatterns: [/cdn\.segment\.com/i],
    inlinePatterns: [/analytics\.load/i],
    idExtractors: [/analytics\.load\s*\(\s*['"]([^'"]+)['"]/],
  },
  {
    name: 'Cookie Consent (Termly)',
    category: 'consent',
    zarazToolName: '',
    zarazSupported: false,
    payloadKb: 50,
    srcPatterns: [/app\.termly\.io/i],
    inlinePatterns: [],
    idExtractors: [],
  },
  {
    name: 'Cookie Consent (OneTrust)',
    category: 'consent',
    zarazToolName: '',
    zarazSupported: false,
    payloadKb: 60,
    srcPatterns: [/cdn\.cookielaw\.org/i],
    inlinePatterns: [],
    idExtractors: [],
  },
  {
    name: 'Twitter/X Ads',
    category: 'advertising',
    zarazToolName: 'Twitter Pixel',
    zarazSupported: true,
    payloadKb: 30,
    srcPatterns: [/static\.ads-twitter\.com/i],
    inlinePatterns: [/twq\(\s*['"]init['"]/i],
    idExtractors: [/twq\(\s*['"]init['"]\s*,\s*['"]([^'"]+)['"]/],
  },
];

/**
 * Detect all third-party tools from ScriptScanner output.
 */
export function detectThirdPartyTools(scriptRecords: ScriptRecord[]): ThirdPartyReport {
  const detectedTools: DetectedTool[] = [];
  const seen = new Set<string>();
  let removedCount = 0;
  let payloadSaved = 0;

  // Collect all inline script content for pattern matching
  const allInlineContent = scriptRecords
    .filter(r => r.type === 'inline' && r.content)
    .map(r => r.content!)
    .join('\n');

  for (const sig of TOOL_SIGNATURES) {
    let matched = false;
    let matchedSrc = '';
    let trackingId: string | null = null;

    // Check external script src patterns
    for (const record of scriptRecords) {
      if (!record.src) continue;
      for (const pattern of sig.srcPatterns) {
        if (pattern.test(record.src)) {
          matched = true;
          matchedSrc = record.src;
          // Try to extract ID from the src URL itself
          for (const extractor of sig.idExtractors) {
            const m = record.src.match(extractor);
            if (m) { trackingId = m[1] || m[0]; break; }
          }
          break;
        }
      }
      if (matched) break;
    }

    // Check inline script content patterns
    if (!matched && sig.inlinePatterns.length > 0) {
      for (const pattern of sig.inlinePatterns) {
        if (pattern.test(allInlineContent)) {
          matched = true;
          matchedSrc = '[inline]';
          break;
        }
      }
    }

    // Extract tracking ID from inline content if not found in src
    if (matched && !trackingId) {
      for (const extractor of sig.idExtractors) {
        const m = allInlineContent.match(extractor);
        if (m) { trackingId = m[1] || m[0]; break; }
      }
    }

    if (matched && !seen.has(sig.name)) {
      seen.add(sig.name);

      // Don't double-count GA4 and Google Ads (same script src)
      if (sig.name === 'Google Ads' && seen.has('Google Analytics 4') && matchedSrc.includes('googletagmanager')) {
        // Only add if we found an AW- ID
        if (!trackingId || !trackingId.startsWith('AW-')) continue;
      }

      detectedTools.push({
        name: sig.name,
        category: sig.category,
        scriptSrc: matchedSrc,
        trackingId,
        zarazSupported: sig.zarazSupported,
        zarazToolName: sig.zarazToolName,
        payloadKb: sig.payloadKb,
      });

      if (sig.zarazSupported) {
        removedCount++;
        payloadSaved += sig.payloadKb;
      }
    }
  }

  const zarazConfigSpec = detectedTools
    .filter(t => t.zarazSupported)
    .map(t => ({ toolName: t.zarazToolName, trackingId: t.trackingId }));

  return {
    detectedTools,
    zarazConfigSpec,
    removedScriptCount: removedCount,
    estimatedPayloadSavedKb: payloadSaved,
  };
}
