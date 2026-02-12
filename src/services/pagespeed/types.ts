/**
 * Comprehensive PageSpeed Insights API types.
 * Extracted from Google PageSpeed Insights v5 response structure.
 */

export interface CategoryResult {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  manual?: boolean;
}

export interface LighthouseAudit {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  scoreDisplayMode?: 'binary' | 'numeric' | 'manual' | 'informative' | 'notApplicable';
  numericValue?: number;
  numericUnit?: string;
  displayValue?: string;
  explanation?: string;
  errorMessage?: string;
  warnings?: string[];
  details?: unknown;
}

export interface CrUXMetric {
  percentile: number;
  category: 'fast' | 'average' | 'slow' | 'n/a';
}

export interface CrUXData {
  metrics?: Record<string, CrUXMetric>;
  overall_category?: string;
}

export interface LighthouseEnvironment {
  hostUserAgent?: string;
  networkUserAgent?: string;
  benchmarkIndex?: number;
}

export interface TimingEntry {
  name: string;
  duration: number;
}

export interface StackPack {
  id: string;
  title: string;
  iconDataURL?: string;
  descriptions: Record<string, string>;
}

export interface RawPageSpeedResponse {
  id?: string;
  loadingExperience?: CrUXData;
  originLoadingExperience?: CrUXData;
  lighthouseResult?: {
    requestedUrl: string;
    finalUrl: string;
    fetchTime: string;
    lighthouseVersion?: string;
    userAgent?: string;
    environment?: LighthouseEnvironment;
    categories?: Record<string, CategoryResult>;
    audits?: Record<string, LighthouseAudit>;
    stackPacks?: StackPack[];
    timing?: { entries: TimingEntry[]; total: number };
    configSettings?: Record<string, unknown>;
  };
}

// ─── Extracted / Normalized Types ────────────────────────────────────

export interface ExtractedMetric {
  score: number | null;
  numericValue?: number;
  displayValue?: string;
  unit?: string;
  threshold?: { good: number; poor: number };
  element?: string;
}

export interface Opportunity {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  displayValue?: string;
  savingsMs?: number;
  savingsBytes?: number;
  details?: unknown;
  aiActions: string[];
}

export interface AccessibilityIssue {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  elementCount?: number;
  aiActions: string[];
}

export interface SEOIssue {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  aiActions: string[];
}

export interface BestPracticesIssue {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  aiActions: string[];
}

export interface OptimizationAction {
  priority: number;
  category: 'performance' | 'accessibility' | 'seo' | 'best-practices';
  action: string;
  auditId: string;
  estimatedImpact: 'high' | 'medium' | 'low';
  automatable: boolean;
  codeChanges: string[];
  targetElement?: unknown;
  verification: string;
}

export interface OptimizationWorkflow {
  metadata: {
    url: string;
    finalUrl: string;
    fetchTime: string;
    strategy: 'mobile' | 'desktop';
    lighthouseVersion?: string;
    userAgent?: string;
  };
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    pwa?: number;
  };
  coreWebVitals: {
    lcp: ExtractedMetric;
    tbt: ExtractedMetric;
    cls: ExtractedMetric;
    fcp: ExtractedMetric;
    si: ExtractedMetric;
  };
  opportunities: Opportunity[];
  accessibilityIssues: AccessibilityIssue[];
  seoIssues: SEOIssue[];
  bestPracticesIssues: BestPracticesIssue[];
  resourceAnalysis?: {
    totalByteWeight?: number;
    domSize?: number;
    criticalRequestChains?: unknown;
    mainThreadWork?: unknown;
    thirdPartyCode?: unknown;
  };
  problemElements?: {
    lcpElement?: unknown;
    layoutShiftElements?: unknown;
    renderBlockingResources?: unknown;
    unusedCssRules?: unknown;
    unusedJavaScript?: unknown;
  };
  fieldData?: {
    lcpP75?: number;
    clsP75?: number;
    inpP75?: number;
    category?: string;
  } | null;
  optimizationPlan: OptimizationAction[];
}
