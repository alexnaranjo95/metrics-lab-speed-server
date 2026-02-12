/**
 * Comprehensive PageSpeed Insights data extraction and AI action plan generation.
 */

import type {
  RawPageSpeedResponse,
  OptimizationWorkflow,
  ExtractedMetric,
  Opportunity,
  AccessibilityIssue,
  SEOIssue,
  BestPracticesIssue,
  OptimizationAction,
  LighthouseAudit,
} from './types.js';
import { PERFORMANCE_AUDITS, ACCESSIBILITY_AUDITS, SEO_AUDITS, BEST_PRACTICES_AUDITS } from './auditMappings.js';

function extractMetric(audit: LighthouseAudit | undefined, mapping?: { threshold?: { good: number; poor: number } }): ExtractedMetric {
  if (!audit) return { score: null };

  const threshold = mapping?.threshold;
  const numVal = audit.numericValue;
  const score = audit.score;

  return {
    score: audit.score,
    numericValue: numVal,
    displayValue: audit.displayValue,
    unit: audit.numericUnit,
    threshold,
    element: (audit.details as any)?.items?.[0]?.items?.[0]?.node?.snippet,
  };
}

function extractOpportunities(audits: Record<string, LighthouseAudit>): Opportunity[] {
  const opps: Opportunity[] = [];

  const opportunityIds = [
    'render-blocking-resources',
    'unused-css-rules',
    'unused-javascript',
    'uses-optimized-images',
    'modern-image-formats',
    'uses-responsive-images',
    'efficiently-encode-images',
    'uses-text-compression',
    'uses-rel-preconnect',
    'uses-rel-preload',
  ];

  for (const id of opportunityIds) {
    const audit = audits[id];
    if (!audit) continue;

    const mapping = PERFORMANCE_AUDITS[id];
    const aiActions = mapping?.aiActions ?? [];

    const details = audit.details as any;
    const savingsMs = details?.overallSavingsMs ?? details?.numericValue;
    const savingsBytes = details?.overallSavingsBytes;

    if (audit.score !== null && audit.score < 1) {
      opps.push({
        id,
        title: audit.title,
        description: audit.description,
        score: audit.score,
        displayValue: audit.displayValue,
        savingsMs,
        savingsBytes,
        details: audit.details,
        aiActions,
      });
    }
  }

  return opps.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0));
}

function extractAccessibilityIssues(audits: Record<string, LighthouseAudit>): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  for (const [id, mapping] of Object.entries(ACCESSIBILITY_AUDITS)) {
    const audit = audits[id];
    if (!audit || audit.score === null || audit.score >= 1) continue;

    const details = audit.details as any;
    const elementCount = details?.items?.length;

    issues.push({
      id,
      title: audit.title,
      description: audit.description,
      score: audit.score,
      elementCount,
      aiActions: mapping.aiActions,
    });
  }

  return issues;
}

function extractSEOIssues(audits: Record<string, LighthouseAudit>): SEOIssue[] {
  const issues: SEOIssue[] = [];

  for (const [id, mapping] of Object.entries(SEO_AUDITS)) {
    const audit = audits[id];
    if (!audit) continue;
    if (audit.score !== null && audit.score >= 1) continue;

    issues.push({
      id,
      title: audit.title,
      description: audit.description,
      score: audit.score,
      aiActions: mapping.aiActions,
    });
  }

  return issues;
}

function extractBestPracticesIssues(audits: Record<string, LighthouseAudit>): BestPracticesIssue[] {
  const issues: BestPracticesIssue[] = [];

  for (const [id, mapping] of Object.entries(BEST_PRACTICES_AUDITS)) {
    const audit = audits[id];
    if (!audit || audit.score === null || audit.score >= 1) continue;

    issues.push({
      id,
      title: audit.title,
      description: audit.description,
      score: audit.score,
      aiActions: mapping.aiActions,
    });
  }

  return issues;
}

function extractFieldData(data: RawPageSpeedResponse): OptimizationWorkflow['fieldData'] {
  const crux = data.loadingExperience?.metrics;
  if (!crux) return null;

  return {
    lcpP75: crux.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
    clsP75: crux.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile,
    inpP75: crux.INTERACTION_TO_NEXT_PAINT?.percentile,
    category: data.loadingExperience?.overall_category,
  };
}

function generateAIActionPlan(audits: Record<string, LighthouseAudit>, strategy: 'mobile' | 'desktop'): OptimizationAction[] {
  const actions: OptimizationAction[] = [];

  // High-impact performance (TBT + LCP = 55% of score)
  const tbt = audits['total-blocking-time'];
  if (tbt?.score !== null && tbt.score < 0.5) {
    const mapping = PERFORMANCE_AUDITS['total-blocking-time'];
    actions.push({
      priority: 1,
      category: 'performance',
      action: 'reduce-javascript-execution',
      auditId: 'total-blocking-time',
      estimatedImpact: 'high',
      automatable: true,
      codeChanges: mapping?.aiActions ?? ['defer-non-critical-scripts', 'code-split', 'remove-unused-js'],
      verification: 'tbt-measurement',
    });
  }

  const lcp = audits['largest-contentful-paint'];
  if (lcp?.score !== null && lcp.score < 0.5) {
    const mapping = PERFORMANCE_AUDITS['largest-contentful-paint'];
    const lcpElement = audits['largest-contentful-paint-element'];
    actions.push({
      priority: 1,
      category: 'performance',
      action: 'optimize-lcp-element',
      auditId: 'largest-contentful-paint',
      estimatedImpact: 'high',
      automatable: true,
      codeChanges: mapping?.aiActions ?? ['preload-lcp-resource', 'optimize-hero-image', 'eliminate-render-blocking'],
      targetElement: lcpElement?.details,
      verification: 'lcp-measurement',
    });
  }

  // Accessibility (required for compliance)
  for (const [auditId, audit] of Object.entries(audits)) {
    if (auditId in ACCESSIBILITY_AUDITS && audit?.score === 0) {
      const mapping = ACCESSIBILITY_AUDITS[auditId];
      actions.push({
        priority: 2,
        category: 'accessibility',
        action: `fix-${auditId}`,
        auditId,
        estimatedImpact: 'medium',
        automatable: ['image-alt', 'button-name', 'link-name', 'label', 'color-contrast'].includes(auditId),
        codeChanges: mapping.aiActions,
        verification: 'accessibility-audit',
      });
    }
  }

  // SEO
  for (const [auditId, audit] of Object.entries(audits)) {
    if (auditId in SEO_AUDITS && audit?.score !== null && audit.score < 1) {
      const mapping = SEO_AUDITS[auditId];
      actions.push({
        priority: 3,
        category: 'seo',
        action: `optimize-${auditId}`,
        auditId,
        estimatedImpact: 'medium',
        automatable: true,
        codeChanges: mapping.aiActions,
        verification: 'seo-validation',
      });
    }
  }

  // Best practices
  for (const [auditId, audit] of Object.entries(audits)) {
    if (auditId in BEST_PRACTICES_AUDITS && audit?.score !== null && audit.score < 1) {
      const mapping = BEST_PRACTICES_AUDITS[auditId];
      actions.push({
        priority: 4,
        category: 'best-practices',
        action: `fix-${auditId}`,
        auditId,
        estimatedImpact: 'low',
        automatable: ['charset', 'doctype'].includes(auditId),
        codeChanges: mapping.aiActions,
        verification: 'best-practices-audit',
      });
    }
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

function getStrategy(data: RawPageSpeedResponse): 'mobile' | 'desktop' {
  const ua = data.lighthouseResult?.environment?.hostUserAgent ?? '';
  return ua.includes('Mobile') ? 'mobile' : 'desktop';
}

/**
 * Extract complete optimization workflow from PageSpeed Insights API response.
 */
export function extractCompletePageSpeedData(
  apiResponse: RawPageSpeedResponse,
  strategy: 'mobile' | 'desktop'
): OptimizationWorkflow {
  const lh = apiResponse.lighthouseResult;
  const audits = lh?.audits ?? {};

  const score = (s: number | null | undefined) => Math.round((s ?? 0) * 100);

  return {
    metadata: {
      url: apiResponse.id ?? lh?.requestedUrl ?? '',
      finalUrl: lh?.finalUrl ?? '',
      fetchTime: lh?.fetchTime ?? '',
      strategy: getStrategy(apiResponse),
      lighthouseVersion: lh?.lighthouseVersion,
      userAgent: lh?.environment?.hostUserAgent,
    },
    scores: {
      performance: score(lh?.categories?.performance?.score),
      accessibility: score(lh?.categories?.accessibility?.score),
      bestPractices: score(lh?.categories?.['best-practices']?.score),
      seo: score(lh?.categories?.seo?.score),
      pwa: lh?.categories?.pwa ? score(lh.categories.pwa.score) : undefined,
    },
    coreWebVitals: {
      lcp: extractMetric(audits['largest-contentful-paint'], PERFORMANCE_AUDITS['largest-contentful-paint']),
      tbt: extractMetric(audits['total-blocking-time'], PERFORMANCE_AUDITS['total-blocking-time']),
      cls: extractMetric(audits['cumulative-layout-shift'], PERFORMANCE_AUDITS['cumulative-layout-shift']),
      fcp: extractMetric(audits['first-contentful-paint'], PERFORMANCE_AUDITS['first-contentful-paint']),
      si: extractMetric(audits['speed-index'], PERFORMANCE_AUDITS['speed-index']),
    },
    opportunities: extractOpportunities(audits),
    accessibilityIssues: extractAccessibilityIssues(audits),
    seoIssues: extractSEOIssues(audits),
    bestPracticesIssues: extractBestPracticesIssues(audits),
    resourceAnalysis: {
      totalByteWeight: (audits['total-byte-weight'] as LighthouseAudit)?.numericValue,
      domSize: (audits['dom-size'] as LighthouseAudit)?.numericValue,
      criticalRequestChains: (audits['critical-request-chains'] as LighthouseAudit)?.details,
      mainThreadWork: (audits['mainthread-work-breakdown'] as LighthouseAudit)?.details,
      thirdPartyCode: (audits['third-party-summary'] as LighthouseAudit)?.details,
    },
    problemElements: {
      lcpElement: audits['largest-contentful-paint-element']?.details,
      layoutShiftElements: audits['layout-shift-elements']?.details,
      renderBlockingResources: audits['render-blocking-resources']?.details,
      unusedCssRules: audits['unused-css-rules']?.details,
      unusedJavaScript: audits['unused-javascript']?.details,
    },
    fieldData: extractFieldData(apiResponse),
    optimizationPlan: generateAIActionPlan(audits, strategy),
  };
}
