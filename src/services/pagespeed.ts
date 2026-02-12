import { config } from '../config.js';
import { measurePerformance as measureWithPlaywright } from './lighthouse.js';

// ─── Types ────────────────────────────────────────────────────────

export interface PageSpeedResult {
  performance: number;
  lcp: number;
  tbt: number;
  cls: number;
  fcp: number;
  si: number;
  ttfb: number;
  strategy: 'mobile' | 'desktop';
  lcpElement?: string;
  opportunities: Array<{ id: string; title: string; savings: number }>;
  fieldData?: { lcpP75: number; clsP75: number; inpP75: number; category: string } | null;
}

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// ─── Main API Call ────────────────────────────────────────────────

export async function measureWithPageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile'
): Promise<PageSpeedResult> {
  const apiKey = config.PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY;

  if (!apiKey) {
    // Fall back to Playwright heuristic
    return fallbackMeasure(url, strategy);
  }

  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance',
    key: apiKey,
  });

  try {
    const response = await fetch(`${PSI_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(90000), // PSI can take up to 60s
    });

    if (response.status === 429) {
      console.warn(`[pagespeed] Rate limited for ${url} — falling back to Playwright`);
      return fallbackMeasure(url, strategy);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[pagespeed] API error ${response.status} for ${url}: ${errText.substring(0, 200)}`);
      return fallbackMeasure(url, strategy);
    }

    const data = await response.json();
    return extractMetrics(data, strategy);

  } catch (err) {
    console.warn(`[pagespeed] Failed for ${url}: ${(err as Error).message} — falling back to Playwright`);
    return fallbackMeasure(url, strategy);
  }
}

// ─── Metric Extraction ────────────────────────────────────────────

function extractMetrics(data: any, strategy: 'mobile' | 'desktop'): PageSpeedResult {
  const lh = data.lighthouseResult;
  if (!lh) {
    return emptyResult(strategy);
  }

  const audits = lh.audits || {};
  const performanceScore = Math.round((lh.categories?.performance?.score ?? 0) * 100);

  // Core Web Vitals
  const lcp = audits['largest-contentful-paint']?.numericValue ?? 0;
  const tbt = audits['total-blocking-time']?.numericValue ?? 0;
  const cls = audits['cumulative-layout-shift']?.numericValue ?? 0;
  const fcp = audits['first-contentful-paint']?.numericValue ?? 0;
  const si = audits['speed-index']?.numericValue ?? 0;
  const ttfb = audits['server-response-time']?.numericValue ?? 0;

  // LCP element
  const lcpItems = audits['largest-contentful-paint-element']?.details?.items;
  const lcpElement = lcpItems?.[0]?.items?.[0]?.node?.snippet || lcpItems?.[0]?.items?.[0]?.node?.nodeLabel;

  // Opportunities (potential savings)
  const opportunities: PageSpeedResult['opportunities'] = [];
  for (const [id, audit] of Object.entries(audits)) {
    const a = audit as any;
    if (a.details?.type === 'opportunity' && a.score !== null && a.score < 1) {
      opportunities.push({
        id,
        title: a.title || id,
        savings: a.details?.overallSavingsMs ?? 0,
      });
    }
  }
  opportunities.sort((a, b) => b.savings - a.savings);

  // Field data (CrUX)
  let fieldData: PageSpeedResult['fieldData'] = null;
  const crux = data.loadingExperience?.metrics;
  if (crux) {
    fieldData = {
      lcpP75: crux.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? 0,
      clsP75: crux.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? 0,
      inpP75: crux.INTERACTION_TO_NEXT_PAINT?.percentile ?? 0,
      category: data.loadingExperience?.overall_category ?? 'NONE',
    };
  }

  return {
    performance: performanceScore,
    lcp: Math.round(lcp),
    tbt: Math.round(tbt),
    cls: Math.round(cls * 1000) / 1000,
    fcp: Math.round(fcp),
    si: Math.round(si),
    ttfb: Math.round(ttfb),
    strategy,
    lcpElement,
    opportunities: opportunities.slice(0, 10),
    fieldData,
  };
}

// ─── Fallback to Playwright ───────────────────────────────────────

async function fallbackMeasure(url: string, strategy: 'mobile' | 'desktop'): Promise<PageSpeedResult> {
  try {
    const result = await measureWithPlaywright(url);
    return {
      performance: result.performance,
      lcp: 0, tbt: 0, cls: 0, fcp: 0, si: 0,
      ttfb: result.ttfb,
      strategy,
      opportunities: [],
      fieldData: null,
    };
  } catch {
    return emptyResult(strategy);
  }
}

function emptyResult(strategy: 'mobile' | 'desktop'): PageSpeedResult {
  return {
    performance: 0, lcp: 0, tbt: 0, cls: 0, fcp: 0, si: 0, ttfb: 0,
    strategy, opportunities: [], fieldData: null,
  };
}

// ─── Helper: Check if PSI is available ────────────────────────────

export function isPageSpeedAvailable(): boolean {
  return !!(config.PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY);
}
