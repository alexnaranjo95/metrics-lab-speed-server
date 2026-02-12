// ─── Site Inventory Types ─────────────────────────────────────────

export interface SiteInventory {
  url: string;
  pageCount: number;
  totalSizeBytes: number;
  pages: PageInventory[];
  scripts: ScriptInventory[];
  stylesheets: StylesheetInventory[];
  images: ImageInventory[];
  fonts: FontInventory[];
  wordpress: WordPressInfo;
  interactiveElements: InteractiveElement[];
  jqueryUsed: boolean;
  jqueryVersion: string | null;
  jqueryDependentScripts: string[];
  baselineScreenshots: BaselineScreenshot[];
  baselineBehavior: FunctionalBaseline[];
}

export interface PageInventory {
  url: string;
  path: string;
  title: string;
  sizeBytes: number;
  scriptsCount: number;
  stylesheetsCount: number;
  imagesCount: number;
  hasForm: boolean;
  hasSlider: boolean;
  hasAccordion: boolean;
  hasTabs: boolean;
  hasModal: boolean;
  hasDropdownMenu: boolean;
  hasVideo: boolean;
}

export interface ScriptInventory {
  src: string;
  isExternal: boolean;
  isInline: boolean;
  sizeBytes: number;
  isWordPressBloat: boolean;
  isJquery: boolean;
  isJqueryPlugin: boolean;
  pluginName?: string;
  isAnalytics: boolean;
  isEssential: boolean;
  hasDefer: boolean;
  hasAsync: boolean;
  pages: string[];
}

export interface StylesheetInventory {
  href: string;
  isExternal: boolean;
  sizeBytes: number;
  pages: string[];
}

export interface ImageInventory {
  src: string;
  width: number;
  height: number;
  sizeBytes: number;
  hasAlt: boolean;
  isLazy: boolean;
  format: string;
}

export interface FontInventory {
  family: string;
  src: string;
  isGoogleFont: boolean;
  isSelfHosted: boolean;
}

export interface WordPressInfo {
  version: string | null;
  theme: string | null;
  plugins: string[];
  isElementor: boolean;
  isGutenberg: boolean;
  isWooCommerce: boolean;
}

// ─── Interactive Element Types ────────────────────────────────────

export type InteractiveElementType =
  | 'link' | 'button' | 'form' | 'dropdown' | 'slider'
  | 'accordion' | 'tab' | 'modal' | 'carousel' | 'lightbox'
  | 'hamburger-menu' | 'scroll-to-top' | 'video-player'
  | 'search' | 'tooltip';

export interface InteractiveElement {
  page: string;
  type: InteractiveElementType;
  selector: string;
  description: string;
  triggerAction: 'click' | 'hover' | 'focus' | 'scroll';
  expectedBehavior: string;
  dependsOnJquery: boolean;
  dependsOnScript: string | null;
}

// ─── Baseline Types ───────────────────────────────────────────────

export interface BaselineScreenshot {
  page: string;
  viewport: 'desktop' | 'mobile' | 'tablet';
  width: number;
  height: number;
  fullPagePath: string;
  aboveFoldPath: string;
  timestamp: string;
}

export interface ElementState {
  isVisible: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  computedStyle: {
    display: string;
    visibility: string;
    opacity: string;
    height: string;
  };
  classList: string[];
  innerText: string;
  activeSlideIndex?: number;
}

export interface FunctionalBaseline {
  page: string;
  type: InteractiveElementType;
  selector: string;
  description: string;
  triggerAction: string;
  baselineResult: string;
  stateBefore?: ElementState | null;
  stateAfter?: ElementState | null;
  passed: boolean;
}

// ─── Verification Result Types ────────────────────────────────────

export interface VisualComparisonResult {
  page: string;
  viewport: string;
  diffPercent: number;
  diffPixels: number;
  totalPixels: number;
  diffImagePath: string;
  baselineImagePath: string;
  optimizedImagePath: string;
  status: 'identical' | 'acceptable' | 'needs-review' | 'failed';
  aiReview?: string;
}

export interface FunctionalTestResult {
  element: InteractiveElement;
  passed: boolean;
  failureReason?: string;
  screenshotPath?: string;
}

export interface LinkVerificationResult {
  page: string;
  href: string;
  resolvedUrl: string;
  text: string;
  status: number | null;
  passed: boolean;
  failureReason?: string;
  isExternal: boolean;
  isInternal: boolean;
}

export interface PerformanceResult {
  page: string;
  performance: number;
  ttfb: number;
  loadTimeMs: number;
}

// ─── Agent Types ──────────────────────────────────────────────────

export interface OptimizationPlan {
  settings: Record<string, any>;
  reasoning: Record<string, string>;
  risks: string[];
  expectedPerformance: { lighthouse: number; lcp: string; cls: string };
}

export interface IterationResult {
  iteration: number;
  settings: Record<string, any>;
  buildId: string;
  edgeUrl: string | null;
  performance: PerformanceResult[];
  visualComparisons: VisualComparisonResult[];
  functionalTests: FunctionalTestResult[];
  linkVerification: LinkVerificationResult[];
  pageSpeedVerification?: import('../verification/pagespeed.js').PageSpeedVerificationSummary;
}

export interface AIReviewDecision {
  overallVerdict: 'pass' | 'needs-changes' | 'critical-failure';
  settingChanges: Record<string, any>;
  reasoning: string;
  issuesSummary: string[];
  remainingIssues: string[];
  shouldRebuild: boolean;
  confidenceLevel: number;
}

export interface AgentReport {
  siteId: string;
  originalUrl: string;
  totalIterations: number;
  finalVerdict: string;
  finalSettings: Record<string, any>;
  baselinePerformance: number;
  finalPerformance: PerformanceResult[];
  visualResults: VisualComparisonResult[];
  functionalResults: FunctionalTestResult[];
  linkResults: LinkVerificationResult[];
  iterationHistory: Array<{
    iteration: number;
    avgPerformance: number;
    visualFailures: number;
    functionalFailures: number;
    brokenLinks: number;
  }>;
}

export type AgentPhase = 'analyzing' | 'planning' | 'building' | 'verifying' | 'reviewing' | 'complete' | 'failed';
