import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { measurePerformance as measureWithPlaywright } from './lighthouse.js';
import { extractCompletePageSpeedData } from './pagespeed/extractor.js';
import type { RawPageSpeedResponse } from './pagespeed/types.js';
import type { OptimizationWorkflow } from './pagespeed/types.js';

/** Path for the last raw PageSpeed API response (for debugging / inspection). */
export const LAST_PAGESPEED_RESPONSE_PATH = join(process.cwd(), 'last-pagespeed-response.json');

function saveLastPageSpeedResponse(data: unknown, url: string, strategy: string): void {
  try {
    const payload = { url, strategy, fetchedAt: new Date().toISOString(), ...(data as object) };
    writeFileSync(LAST_PAGESPEED_RESPONSE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // ignore write errors
  }
}

/**
 * Return the last raw JSON saved from a PageSpeed API run, or null if none exists.
 */
export function getLastPageSpeedResponse(): unknown | null {
  if (!existsSync(LAST_PAGESPEED_RESPONSE_PATH)) return null;
  try {
    const raw = readFileSync(LAST_PAGESPEED_RESPONSE_PATH, 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export type { OptimizationWorkflow } from './pagespeed/types.js';

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

// ─── Full PageSpeed (All Categories) ───────────────────────────────

/**
 * Fetch complete PageSpeed Insights data with all categories (performance,
 * accessibility, best-practices, seo). Returns comprehensive optimization workflow
 * for AI-driven code modifications.
 */
export async function fetchFullPageSpeedData(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile'
): Promise<OptimizationWorkflow | null> {
  const apiKey = config.PAGESPEED_API_KEY || process.env.PAGESPEED_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    url,
    strategy,
    key: apiKey,
  });
  // Request all categories (omit category = all)
  params.append('category', 'performance');
  params.append('category', 'accessibility');
  params.append('category', 'best-practices');
  params.append('category', 'seo');

  try {
    const response = await fetch(`${PSI_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) return null;
    const data: RawPageSpeedResponse = await response.json();
    saveLastPageSpeedResponse(data, url, strategy);

    if (!data.lighthouseResult) return null;

    return extractCompletePageSpeedData(data, strategy);
  } catch {
    return null;
  }
}

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
    saveLastPageSpeedResponse(data, url, strategy);
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

// ─── Comparison Runner ────────────────────────────────────────────

import { db } from '../db/index.js';
import { performanceComparisons } from '../db/schema.js';
import { buildEmitter } from '../events/buildEmitter.js';

export interface ComparisonRecord {
  id: string;
  siteId: string;
  buildId: string | null;
  testedAt: Date;
  strategy: 'mobile' | 'desktop';
  originalDomain: string;
  optimizedDomain: string;
  original: PageSpeedResult;
  optimized: PageSpeedResult;
  improvements: {
    score: number;
    lcp: number;
    tbt: number;
    cls: number;
    fcp: number;
    si: number;
  };
}

function calcImprovement(original: number, optimized: number): number {
  if (original === 0) return 0;
  return Math.round(((original - optimized) / original) * 10000) / 100;
}

function calcScoreImprovement(original: number, optimized: number): number {
  if (original === 0) return optimized > 0 ? 100 : 0;
  return Math.round(((optimized - original) / original) * 10000) / 100;
}

/**
 * Run a full comparison between original and optimized domains.
 * Tests both mobile and desktop strategies.
 * Persists results to performance_comparisons table.
 * Emits SSE events for real-time updates.
 */
export async function runComparison(
  siteId: string,
  originalUrl: string,
  optimizedUrl: string,
  buildId?: string | null,
  payloadSavings?: {
    totalKb?: number;
    imageKb?: number;
    jsKb?: number;
    cssKb?: number;
  }
): Promise<ComparisonRecord[]> {
  const { nanoid } = await import('nanoid');
  const testId = `test_${nanoid(12)}`;

  buildEmitter.emitPerfStarted(siteId, {
    testId,
    originalDomain: originalUrl,
    optimizedDomain: optimizedUrl,
  });

  const results: ComparisonRecord[] = [];

  for (const strategy of ['mobile', 'desktop'] as const) {
    buildEmitter.emitPerfProgress(siteId, {
      testId,
      step: `${strategy}_start`,
      message: `Running ${strategy} tests...`,
    });

    // Run both tests in parallel for this strategy
    const [original, optimized] = await Promise.all([
      measureWithPageSpeed(originalUrl, strategy),
      measureWithPageSpeed(optimizedUrl, strategy),
    ]);

    buildEmitter.emitPerfProgress(siteId, {
      testId,
      step: `${strategy}_complete`,
      message: `${strategy} tests complete: ${original.performance} → ${optimized.performance}`,
    });

    const improvements = {
      score: calcScoreImprovement(original.performance, optimized.performance),
      lcp: calcImprovement(original.lcp, optimized.lcp),
      tbt: calcImprovement(original.tbt, optimized.tbt),
      cls: calcImprovement(original.cls, optimized.cls),
      fcp: calcImprovement(original.fcp, optimized.fcp),
      si: calcImprovement(original.si, optimized.si),
    };

    const id = `pc_${nanoid(12)}`;
    const testedAt = new Date();

    // Persist to DB
    await db.insert(performanceComparisons).values({
      id,
      siteId,
      buildId: buildId ?? null,
      testedAt,
      strategy,
      originalDomain: originalUrl,
      optimizedDomain: optimizedUrl,
      originalPerformanceScore: original.performance,
      originalLcpMs: original.lcp,
      originalTbtMs: original.tbt,
      originalCls: original.cls,
      originalFcpMs: original.fcp,
      originalSiMs: original.si,
      originalTtfbMs: original.ttfb,
      optimizedPerformanceScore: optimized.performance,
      optimizedLcpMs: optimized.lcp,
      optimizedTbtMs: optimized.tbt,
      optimizedCls: optimized.cls,
      optimizedFcpMs: optimized.fcp,
      optimizedSiMs: optimized.si,
      optimizedTtfbMs: optimized.ttfb,
      scoreImprovement: improvements.score,
      lcpImprovement: improvements.lcp,
      tbtImprovement: improvements.tbt,
      clsImprovement: improvements.cls,
      fcpImprovement: improvements.fcp,
      siImprovement: improvements.si,
      totalPayloadReductionKb: payloadSavings?.totalKb ?? null,
      imageOptimizationSavingsKb: payloadSavings?.imageKb ?? null,
      jsOptimizationSavingsKb: payloadSavings?.jsKb ?? null,
      cssOptimizationSavingsKb: payloadSavings?.cssKb ?? null,
      fieldDataOriginal: original.fieldData ?? null,
      fieldDataOptimized: optimized.fieldData ?? null,
      opportunitiesOriginal: original.opportunities,
      opportunitiesOptimized: optimized.opportunities,
    });

    results.push({
      id,
      siteId,
      buildId: buildId ?? null,
      testedAt,
      strategy,
      originalDomain: originalUrl,
      optimizedDomain: optimizedUrl,
      original,
      optimized,
      improvements,
    });
  }

  buildEmitter.emitPerfComplete(siteId, { testId, comparisons: results });
  return results;
}

// ─── Business Impact Calculator ───────────────────────────────────

export interface BusinessImpact {
  conversionRateIncrease: number;  // percentage
  bounceRateReduction: number;     // percentage
  pageViewsIncrease: number;       // percentage
  seoRankingImpact: 'positive' | 'neutral' | 'negative';
  loadTimeReductionMs: number;
  scoreImprovement: number;
}

export function calculateBusinessImpact(
  originalScore: number,
  optimizedScore: number,
  originalLcpMs: number,
  optimizedLcpMs: number
): BusinessImpact {
  const loadTimeReductionMs = originalLcpMs - optimizedLcpMs;
  const loadTimeReductionS = Math.max(0, loadTimeReductionMs / 1000);
  const scoreImprovement = optimizedScore - originalScore;

  return {
    // 7% conversion increase per second of LCP improvement, max 50%
    conversionRateIncrease: Math.round(Math.min(loadTimeReductionS * 7, 50) * 100) / 100,
    // 11% bounce rate reduction per second, max 40%
    bounceRateReduction: Math.round(Math.min(loadTimeReductionS * 11, 40) * 100) / 100,
    // 5% page views increase per second, max 30%
    pageViewsIncrease: Math.round(Math.min(loadTimeReductionS * 5, 30) * 100) / 100,
    seoRankingImpact: scoreImprovement > 20 ? 'positive' : scoreImprovement < -10 ? 'negative' : 'neutral',
    loadTimeReductionMs: Math.round(loadTimeReductionMs),
    scoreImprovement,
  };
}
