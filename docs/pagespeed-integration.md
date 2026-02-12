# PageSpeed Insights API Integration

## Overview

This system deeply integrates with Google PageSpeed Insights API (v5) to provide comprehensive website performance analysis and optimization guidance. The integration goes beyond basic metrics to provide actionable optimization strategies.

## API Configuration

### Environment Setup
```bash
# Required environment variable
PAGESPEED_API_KEY=your_google_api_key_here

# API endpoint (automatically configured)
PSI_ENDPOINT=https://www.googleapis.com/pagespeedonline/v5/runPagespeed
```

### Rate Limiting
- **Limit**: 400 requests per 100 seconds
- **Strategy**: Sequential testing (mobile first, then desktop)
- **Fallback**: Playwright-based measurement when rate limited

## Data Extraction

### Complete Lighthouse Data
The system extracts comprehensive data from PageSpeed responses:

```typescript
interface OptimizationWorkflow {
  metadata: {
    url: string;
    finalUrl: string;
    fetchTime: string;
    strategy: 'mobile' | 'desktop';
    lighthouseVersion: string;
    userAgent: string;
  };
  scores: {
    performance: number;        // 0-100
    accessibility: number;      // 0-100
    bestPractices: number;      // 0-100
    seo: number;               // 0-100
    pwa?: number;              // 0-100 (when applicable)
  };
  coreWebVitals: {
    lcp: ExtractedMetric;      // Largest Contentful Paint
    tbt: ExtractedMetric;      // Total Blocking Time
    cls: ExtractedMetric;      // Cumulative Layout Shift
    fcp: ExtractedMetric;      // First Contentful Paint
    si: ExtractedMetric;       // Speed Index
  };
  opportunities: Opportunity[];           // Performance improvements
  accessibilityIssues: AccessibilityIssue[];  // WCAG violations
  seoIssues: SEOIssue[];                 // SEO problems
  bestPracticesIssues: BestPracticesIssue[];  // Security/best practices
  fieldData?: CrUXData;                  // Real user metrics
  optimizationPlan: OptimizationAction[]; // AI-generated action plan
}
```

### Core Web Vitals Analysis

**Largest Contentful Paint (LCP)**
- **Good**: ≤ 2.5 seconds
- **Needs Improvement**: 2.5-4.0 seconds  
- **Poor**: > 4.0 seconds

```typescript
interface LCPAnalysis {
  value: number;              // LCP time in milliseconds
  element?: string;           // LCP element selector/description
  optimizations: [
    'optimize-lcp-image',     // Convert/compress LCP image
    'preload-lcp-resource',   // Add <link rel="preload">
    'optimize-fonts',         // Self-host and preload fonts
    'reduce-server-response-time' // Improve TTFB
  ];
}
```

**Total Blocking Time (TBT)**
- **Good**: ≤ 200 milliseconds
- **Needs Improvement**: 200-600 milliseconds
- **Poor**: > 600 milliseconds

```typescript
interface TBTAnalysis {
  value: number;              // TBT time in milliseconds
  optimizations: [
    'defer-non-critical-js',  // Move JS to end of body
    'code-split',             // Break up large JS bundles
    'remove-unused-js',       // Tree shake unused code
    'optimize-third-party'    // Lazy load widgets/embeds
  ];
}
```

**Cumulative Layout Shift (CLS)**
- **Good**: ≤ 0.1
- **Needs Improvement**: 0.1-0.25
- **Poor**: > 0.25

```typescript
interface CLSAnalysis {
  value: number;              // CLS score
  elements?: string[];        // Elements causing shifts
  optimizations: [
    'add-image-dimensions',   // Set width/height on images
    'reserve-ad-space',       // Reserve space for dynamic content
    'avoid-dynamic-content',  // Minimize content injection
    'optimize-font-loading'   // Prevent FOIT/FOUT
  ];
}
```

## Audit Mapping System

### Performance Audits (200+ mapped)

The system maintains comprehensive mappings from PageSpeed audit IDs to optimization actions:

```typescript
const PERFORMANCE_AUDITS = {
  // Critical rendering path
  'render-blocking-resources': {
    aiActions: ['defer-css', 'inline-critical-css', 'defer-js'],
    codeModification: 'resource-optimization',
    priority: 1,
    estimatedImpact: 15 // percentage points
  },
  
  // Image optimizations
  'uses-optimized-images': {
    aiActions: ['convert-webp', 'compress-images', 'responsive-images'],
    codeModification: 'image-pipeline',
    priority: 1,
    estimatedImpact: 12
  },
  
  // JavaScript optimizations
  'unused-javascript': {
    aiActions: ['tree-shake-js', 'code-splitting', 'dynamic-imports'],
    codeModification: 'javascript-optimization',
    priority: 2,
    estimatedImpact: 8
  },
  
  // CSS optimizations
  'unused-css-rules': {
    aiActions: ['purge-css', 'critical-css-extraction', 'remove-unused-styles'],
    codeModification: 'css-optimization',
    priority: 2,
    estimatedImpact: 6
  }
  
  // ... 180+ more audit mappings
};
```

### Accessibility Audits (50+ mapped)

```typescript
const ACCESSIBILITY_AUDITS = {
  'image-alt': {
    aiActions: ['generate-alt-text', 'identify-decorative-images'],
    codeModification: 'html-accessibility',
    wcagLevel: 'A',
    estimatedImpact: 5
  },
  
  'button-name': {
    aiActions: ['add-aria-labels', 'improve-button-text'],
    codeModification: 'interactive-elements',
    wcagLevel: 'A',
    estimatedImpact: 3
  },
  
  'color-contrast': {
    aiActions: ['analyze-contrast-ratios', 'suggest-color-improvements'],
    codeModification: 'css-accessibility',
    wcagLevel: 'AA',
    estimatedImpact: 4
  }
  
  // ... 45+ more accessibility mappings
};
```

### SEO Audits (30+ mapped)

```typescript
const SEO_AUDITS = {
  'document-title': {
    aiActions: ['generate-title-tags', 'optimize-title-length'],
    codeModification: 'meta-optimization',
    priority: 1,
    estimatedImpact: 8
  },
  
  'meta-description': {
    aiActions: ['generate-meta-descriptions', 'extract-page-summaries'],
    codeModification: 'meta-optimization',
    priority: 1,
    estimatedImpact: 6
  },
  
  'structured-data': {
    aiActions: ['inject-schema-markup', 'identify-content-types'],
    codeModification: 'structured-data',
    priority: 2,
    estimatedImpact: 4
  }
  
  // ... 25+ more SEO mappings
};
```

## AI-Powered Audit Analysis

### Intelligent Prioritization

The AI analyzes audit results using sophisticated weighting:

```typescript
function analyzePageSpeedAudits(data: OptimizationWorkflow): PrioritizedAudits {
  const audits = data.lighthouseResult.audits;
  const prioritized: AuditAnalysis[] = [];
  
  for (const [auditId, audit] of Object.entries(audits)) {
    if (audit.score !== null && audit.score < 1) {
      const mapping = findAuditMapping(auditId);
      if (!mapping) continue;
      
      // Calculate weighted impact
      const lighthouseWeight = getLighthouseWeight(auditId);
      const potentialSavings = audit.details?.overallSavingsMs || 0;
      const businessImpact = calculateBusinessImpact(potentialSavings);
      
      prioritized.push({
        auditId,
        category: mapping.category,
        impact: calculateImpactLevel(lighthouseWeight, potentialSavings),
        weight: lighthouseWeight,
        estimatedImprovement: mapping.estimatedImpact,
        aiActions: mapping.aiActions,
        codeChangesRequired: mapping.codeModification !== 'settings-only'
      });
    }
  }
  
  // Sort by weighted impact score
  return prioritized.sort((a, b) => b.weight * b.estimatedImprovement - a.weight * a.estimatedImprovement);
}
```

### CLS-Focused Optimization

Special handling for Cumulative Layout Shift issues:

```typescript
interface CLSOptimization {
  threshold: number;          // 0.25 for "needs improvement"
  detectedIssues: {
    missingImageDimensions: boolean;
    webFontLoading: boolean;
    dynamicContent: boolean;
    unstyledContent: boolean;
  };
  optimizationPlan: {
    addImageDimensions: string[];      // Selectors needing dimensions
    optimizeFonts: FontOptimization;   // Font loading strategy
    reserveSpace: ElementReservation;  // Space reservation needs
    preventFOUT: boolean;              // Font display optimization
  };
}
```

### Real User Metrics Integration

When available, the system incorporates Chrome UX Report (CrUX) data:

```typescript
interface CrUXAnalysis {
  hasFieldData: boolean;
  metrics?: {
    lcpP75: number;           // 75th percentile LCP from real users
    clsP75: number;           // 75th percentile CLS from real users  
    inpP75: number;           // 75th percentile INP from real users
    category: 'fast' | 'average' | 'slow';
  };
  
  // Compare lab vs field data
  labVsField: {
    lcpDifference: number;    // Lab LCP vs field LCP
    clsDifference: number;    // Lab CLS vs field CLS
    reliability: 'high' | 'medium' | 'low';
  };
}
```

## Optimization Action Generation

### Automated Action Planning

The system generates specific, actionable optimization plans:

```typescript
interface OptimizationAction {
  priority: number;           // 1 (highest) to 4 (lowest)
  category: 'performance' | 'accessibility' | 'seo' | 'security';
  action: string;             // Human-readable action description
  auditId: string;           // Source PageSpeed audit
  estimatedImpact: 'high' | 'medium' | 'low';
  automatable: boolean;       // Can be automatically applied
  codeChanges: string[];      // Specific code modifications needed
  targetElement?: unknown;    // Specific DOM element (if applicable)
  verification: string;       // How to verify the fix worked
}
```

**Example Action Plan:**
```json
{
  "priority": 1,
  "category": "performance",
  "action": "Optimize Largest Contentful Paint by preloading hero image",
  "auditId": "largest-contentful-paint",
  "estimatedImpact": "high",
  "automatable": true,
  "codeChanges": [
    "Add <link rel=\"preload\" as=\"image\" href=\"hero.jpg\"> to <head>",
    "Add fetchpriority=\"high\" to hero image element",
    "Convert hero image to WebP format with quality 88"
  ],
  "targetElement": "img.hero-image",
  "verification": "Measure LCP improvement via PageSpeed API"
}
```

## Business Impact Calculation

### Performance-to-Business Metrics

The system translates performance improvements into business outcomes:

```typescript
interface BusinessImpact {
  conversionRateIncrease: number;    // Percentage increase expected
  bounceRateReduction: number;       // Percentage reduction expected  
  pageViewsIncrease: number;         // Percentage increase expected
  seoRankingImpact: 'positive' | 'neutral' | 'negative';
  loadTimeReductionMs: number;       // Milliseconds saved
  scoreImprovement: number;          // PageSpeed score improvement
}

function calculateBusinessImpact(
  originalLCP: number,
  optimizedLCP: number
): BusinessImpact {
  const loadTimeReductionS = Math.max(0, (originalLCP - optimizedLCP) / 1000);
  
  return {
    // Research-based conversion rate improvements
    conversionRateIncrease: Math.min(loadTimeReductionS * 7, 50), // 7% per second
    bounceRateReduction: Math.min(loadTimeReductionS * 11, 40),   // 11% per second
    pageViewsIncrease: Math.min(loadTimeReductionS * 5, 30),      // 5% per second
    seoRankingImpact: scoreImprovement > 20 ? 'positive' : 'neutral',
    loadTimeReductionMs: originalLCP - optimizedLCP,
    scoreImprovement: calculateScoreImprovement(originalLCP, optimizedLCP)
  };
}
```

## Verification and Validation

### Post-Optimization Validation

After optimization, the system validates improvements:

```typescript
interface PageSpeedValidation {
  beforeOptimization: PageSpeedResult;
  afterOptimization: PageSpeedResult;
  improvements: {
    performanceScore: number;      // Score point improvement
    lcpImprovement: number;        // LCP time reduction (ms)
    tbtImprovement: number;        // TBT reduction (ms)
    clsImprovement: number;        // CLS score improvement
    accessibilityImprovement: number; // Accessibility score improvement
  };
  auditResolutions: {
    resolved: string[];            // Audit IDs that now pass
    improved: string[];            // Audit IDs with better scores
    regressed: string[];           // Audit IDs that got worse
  };
  businessImpact: BusinessImpact;
}
```

### Continuous Monitoring

The system can monitor PageSpeed metrics over time:

```typescript
interface PerformanceMonitoring {
  frequency: 'hourly' | 'daily' | 'weekly';
  alertThresholds: {
    performanceScoreBelow: number;     // Alert if score drops below
    lcpAbove: number;                  // Alert if LCP exceeds (ms)
    clsAbove: number;                  // Alert if CLS exceeds
  };
  regressionDetection: {
    enabled: boolean;
    threshold: number;                 // Score drop that triggers alert
    consecutiveFailures: number;       // Failures before alerting
  };
}
```

## Error Handling and Fallbacks

### API Error Handling

```typescript
async function measureWithPageSpeed(url: string, strategy: 'mobile' | 'desktop') {
  try {
    const response = await fetch(PSI_ENDPOINT, { signal: AbortSignal.timeout(90000) });
    
    if (response.status === 429) {
      console.warn('Rate limited - falling back to Playwright measurement');
      return fallbackMeasurement(url, strategy);
    }
    
    if (!response.ok) {
      throw new Error(`PSI API error: ${response.status}`);
    }
    
    return extractMetrics(await response.json(), strategy);
  } catch (error) {
    console.warn(`PageSpeed API failed: ${error.message}`);
    return fallbackMeasurement(url, strategy);
  }
}
```

### Playwright Fallback

When PageSpeed API is unavailable, the system uses Playwright with heuristic scoring:

```typescript
async function fallbackMeasurement(url: string): Promise<PageSpeedResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const startTime = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const loadTime = Date.now() - startTime;
  
  // Heuristic performance scoring
  let score = 100;
  if (loadTime > 1000) score -= Math.min(30, (loadTime - 1000) / 100);
  
  const timing = await page.evaluate(() => performance.getEntriesByType('navigation')[0]);
  const ttfb = timing.responseStart - timing.requestStart;
  if (ttfb > 200) score -= Math.min(20, (ttfb - 200) / 50);
  
  return { performance: Math.max(0, score), ttfb, loadTimeMs: loadTime, strategy, opportunities: [] };
}
```

This comprehensive PageSpeed integration enables the AI system to make intelligent, data-driven optimization decisions while providing detailed insights into performance improvements and business impact.