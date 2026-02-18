import { claudeJSON } from './claude.js';
import type { SiteInventory, OptimizationPlan } from './types.js';
import type { OptimizationWorkflow } from '../services/pagespeed/types.js';

export interface EnhancedOptimizationPlan extends OptimizationPlan {
  clsOptimization?: {
    imageDimensionInjection: boolean;
    fontDisplayStrategy: 'optional' | 'swap' | 'fallback';
    dynamicContentReservation: boolean;
    estimatedCLSImprovement: number;
  };
  seoOptimization?: {
    metaTagInjection: boolean;
    autoGenerateAltText: boolean;
    structuredDataInjection: boolean;
    estimatedSEOScore: number;
  };
  securityOptimization?: {
    enableCSP: boolean;
    enableSecurityHeaders: boolean;
    estimatedBestPracticesScore: number;
  };
  prioritizedAudits?: Array<{
    auditId: string;
    category: 'performance' | 'accessibility' | 'seo' | 'best-practices';
    impact: 'high' | 'medium' | 'low';
    weight: number;
    estimatedImprovement: number;
  }>;
}

/**
 * Enhanced optimization planner with PageSpeed audit prioritization
 * and comprehensive optimization intelligence
 */
export async function generateOptimizationPlan(
  inventory: SiteInventory,
  log: (msg: string) => void,
  pageSpeedData?: OptimizationWorkflow | null,
  currentSettings?: Record<string, any> | null
): Promise<EnhancedOptimizationPlan> {
  // Analyze PageSpeed audits for intelligent prioritization
  const auditAnalysis = pageSpeedData ? analyzePageSpeedAudits(pageSpeedData) : null;
  
  const systemPrompt = buildEnhancedSystemPrompt(auditAnalysis);

  const interactive = inventory.interactiveElements.filter(e => e.type !== 'link');

  // Enhanced PageSpeed analysis with audit prioritization
  let pageSpeedSection = '';
  if (pageSpeedData && auditAnalysis) {
    const { scores, coreWebVitals } = pageSpeedData;
    const cls = parseFloat(coreWebVitals.cls.numericValue?.toString() || '0');
    const lcp = parseFloat(coreWebVitals.lcp.numericValue?.toString() || '0');
    
    pageSpeedSection = `

PAGESPEED INSIGHTS ANALYSIS (Mobile):
Current Scores: Performance ${scores.performance}/100, Accessibility ${scores.accessibility}/100, Best Practices ${scores.bestPractices}/100, SEO ${scores.seo}/100

CRITICAL METRICS:
- CLS: ${cls} ${cls > 0.25 ? '(CRITICAL - 10x worse than "poor" threshold!)' : cls > 0.1 ? '(POOR - needs immediate attention)' : '(Good)'}
- LCP: ${(lcp/1000).toFixed(1)}s ${lcp > 4000 ? '(POOR)' : lcp > 2500 ? '(NEEDS IMPROVEMENT)' : '(Good)'}
- TBT: ${coreWebVitals.tbt.numericValue || 'N/A'}ms

PRIORITIZED OPTIMIZATION TARGETS (by impact):
${auditAnalysis.prioritizedAudits.slice(0, 10).map(audit => 
  `${audit.impact === 'high' ? '🔴 HIGH' : audit.impact === 'medium' ? '🟡 MED' : '🟢 LOW'} [${audit.category}] ${audit.auditId} - Expected: +${audit.estimatedImprovement} points (weight: ${audit.weight})`
).join('\n')}

CLS OPTIMIZATION URGENCY: ${cls > 1.0 ? 'CRITICAL (CLS over 1.0 is catastrophic)' : cls > 0.25 ? 'HIGH (CLS causes poor UX)' : 'Medium'}
SEO RECOVERY POTENTIAL: ${scores.seo < 50 ? 'HIGH (mechanical fixes can reach 100/100)' : 'Low'}
SECURITY HEADERS NEEDED: ${scores.bestPractices < 60 ? 'YES (CSP with trusted-types required)' : 'Optional'}
`;
  }

  const userContent = `SITE: ${inventory.url}
Pages: ${inventory.pageCount}
Total size: ${inventory.totalSizeBytes} bytes

WORDPRESS:
- Elementor: ${inventory.wordpress.isElementor}
- Gutenberg: ${inventory.wordpress.isGutenberg}
- WooCommerce: ${inventory.wordpress.isWooCommerce}

SCRIPTS (${inventory.scripts.length}):
${inventory.scripts.map(s => `- ${s.src.split('/').pop()} [bloat:${s.isWordPressBloat}, jquery:${s.isJquery}, plugin:${s.isJqueryPlugin}, analytics:${s.isAnalytics}, defer:${s.hasDefer}]`).join('\n')}

INTERACTIVE ELEMENTS (${interactive.length}):
${interactive.map(e => `- [${e.page}] ${e.type}: ${e.description} (trigger: ${e.triggerAction}, jQuery: ${e.dependsOnJquery})`).join('\n')}

JQUERY: ${inventory.jqueryUsed ? `USED by: ${inventory.jqueryDependentScripts.join(', ')}. DO NOT remove jQuery.` : 'Not detected. jQuery removal MAY be safe.'}
${pageSpeedSection}

PAGES WITH FEATURES:
${inventory.pages.map(p => `- ${p.path}: slider=${p.hasSlider}, accordion=${p.hasAccordion}, tabs=${p.hasTabs}, modal=${p.hasModal}, dropdown=${p.hasDropdownMenu}, form=${p.hasForm}, video=${p.hasVideo}`).join('\n')}
${currentSettings && Object.keys(currentSettings).length > 0 ? `
CURRENT SITE SETTINGS (preserve user overrides, suggest only changes needed for optimization):
${JSON.stringify(currentSettings, null, 2)}

When suggesting settings, MERGE with the above. Preserve sections the user has configured (e.g. cache durations, build scope) unless they conflict with optimization. Focus your suggestions on performance-impacting changes (images, css, js, cls, seo).` : ''}

Generate the complete optimization settings with full reasoning.`;

  log('Sending site inventory to Claude Opus 4 for analysis...');

  log('Generating enhanced optimization plan with Claude...');

  const { data } = await claudeJSON<EnhancedOptimizationPlan>(systemPrompt, userContent);

  // Enhance the plan with PageSpeed-specific optimizations
  const enhancedPlan = enhanceOptimizationPlan(data, auditAnalysis, pageSpeedData);

  log(`Enhanced AI plan generated. Expected Lighthouse: ${enhancedPlan.expectedPerformance?.lighthouse || 'N/A'}`);
  if (enhancedPlan.clsOptimization) {
    log(`  CLS optimization: ${enhancedPlan.clsOptimization.estimatedCLSImprovement.toFixed(3)} improvement expected`);
  }
  if (enhancedPlan.seoOptimization) {
    log(`  SEO optimization: Target score ${enhancedPlan.seoOptimization.estimatedSEOScore}/100`);
  }
  if (enhancedPlan.reasoning) {
    for (const [section, reason] of Object.entries(enhancedPlan.reasoning)) {
      log(`  [${section}] ${reason}`);
    }
  }
  if (enhancedPlan.risks?.length > 0) {
    log(`Identified ${enhancedPlan.risks.length} risks: ${enhancedPlan.risks.join('; ')}`);
  }

  return enhancedPlan;
}

/**
 * Build enhanced system prompt with PageSpeed audit intelligence
 */
function buildEnhancedSystemPrompt(auditAnalysis: any): string {
  return `You are an expert web performance optimization engineer with deep knowledge of Lighthouse audits and PageSpeed optimization. You are analyzing a WordPress website that will be converted to a high-performance static site deployed on Cloudflare Pages.

Generate an optimization settings configuration that addresses SPECIFIC PageSpeed audit failures and maximizes all Lighthouse scores while ensuring ZERO visual or functional regressions.

ENHANCED OPTIMIZATION PRIORITIES:
${auditAnalysis ? `
CRITICAL AUDIT FAILURES (address FIRST):
${auditAnalysis.prioritizedAudits.filter((a: any) => a.impact === 'high').map((a: any) => 
  `- ${a.auditId}: ${a.weight}% of ${a.category} score, ${a.estimatedImprovement} point impact`
).join('\n')}

SPECIFIC OPTIMIZATION TECHNIQUES REQUIRED:
1. CLS OPTIMIZATION (if CLS > 0.1): Enable imageDimensionInjection, use fontDisplayStrategy "optional", enable dynamicContentReservation
2. SEO RECOVERY (if SEO < 80): Enable metaTagInjection, autoGenerateAltText, structuredDataInjection 
3. SECURITY HEADERS (if Best Practices < 80): Enable CSP with require-trusted-types-for 'script'
4. LCP OPTIMIZATION: Enable AVIF conversion, LCP image detection, fetchpriority="high"
` : ''}

CRITICAL RULES (NEVER VIOLATE):
1. NEVER remove a script that an interactive element depends on. If a slider uses Slick (jQuery-dependent), keep jQuery AND Slick.
2. NEVER enable aggressive CSS purging if the site uses Elementor, Beaver Builder, or Divi — their dynamic classes will be purged incorrectly. Use "safe" aggressiveness.
3. NEVER remove dashicons if ANY page uses dashicons classes.
4. NEVER remove Gutenberg frontend JS if the site has interactive Gutenberg blocks.
5. ALWAYS self-host Google Fonts — free performance win with zero risk.
6. For image quality, use tiered quality: LCP images (88% JPEG, 85% WebP, 60% AVIF), standard images (78%, 80%, 50%), thumbnails (65%, 70%, 40%).
7. PurgeCSS aggressiveness must be "safe" for any site using a page builder.
8. If jQuery is used by interactive elements, NEVER remove jQuery.

ENHANCED OPTIMIZATION SETTINGS - Include these new sections:
{
  "cls": {
    "imageDimensionInjection": true,
    "fontDisplayStrategy": "optional",
    "dynamicContentReservation": true,
    "enableLayoutContainment": true
  },
  "seo": {
    "autoGenerateAltText": true,
    "metaTagInjection": true, 
    "structuredDataInjection": true
  },
  "security": {
    "enableCSP": true,
    "enableSecurityHeaders": true,
    "cspDirectives": {
      "require-trusted-types-for": "'script'"
    }
  },
  "images": {
    "convertToAvif": true,
    "lcpImageOptimization": true,
    "responsiveBreakpoints": [400, 800, 1200, 1600]
  }
}

Return ONLY valid JSON with this ENHANCED structure:
{
  "settings": { /* complete optimization settings object with new CLS, SEO, security sections */ },
  "reasoning": { "images": "...", "css": "...", "js": "...", "html": "...", "fonts": "...", "video": "...", "cls": "...", "seo": "...", "security": "..." },
  "risks": ["list of things that might break"],
  "expectedPerformance": { "lighthouse": 95, "lcp": "1200ms", "cls": "0.05", "seo": 100, "bestPractices": 100 },
  "clsOptimization": {
    "imageDimensionInjection": true,
    "fontDisplayStrategy": "optional",
    "dynamicContentReservation": true,
    "estimatedCLSImprovement": 0.8
  },
  "seoOptimization": {
    "metaTagInjection": true,
    "autoGenerateAltText": true,
    "structuredDataInjection": true,
    "estimatedSEOScore": 100
  },
  "securityOptimization": {
    "enableCSP": true,
    "enableSecurityHeaders": true,
    "estimatedBestPracticesScore": 100
  }
}`;
}

/**
 * Analyze PageSpeed audits to prioritize optimization efforts
 */
function analyzePageSpeedAudits(pageSpeedData: OptimizationWorkflow): {
  prioritizedAudits: Array<{
    auditId: string;
    category: 'performance' | 'accessibility' | 'seo' | 'best-practices';
    impact: 'high' | 'medium' | 'low';
    weight: number;
    estimatedImprovement: number;
  }>;
  totalPossibleImprovement: number;
} {
  const audits: any[] = [];

  // Performance audit weights (based on Lighthouse 10+ scoring)
  const performanceWeights = {
    'cumulative-layout-shift': 25,
    'largest-contentful-paint': 25,
    'total-blocking-time': 30,
    'first-contentful-paint': 10,
    'speed-index': 10,
    'unused-css-rules': 8,
    'unused-javascript': 8,
    'render-blocking-resources': 7,
    'unminified-css': 5,
    'unminified-javascript': 5,
    'modern-image-formats': 6,
    'uses-responsive-images': 5,
  };

  // Process performance opportunities
  pageSpeedData.opportunities?.forEach(opportunity => {
    const weight = performanceWeights[opportunity.id as keyof typeof performanceWeights] || 3;
    const impact = weight >= 20 ? 'high' : weight >= 8 ? 'medium' : 'low';
    const estimatedImprovement = Math.min(weight, (1 - (opportunity.score ?? 0)) * weight);

    audits.push({
      auditId: opportunity.id,
      category: 'performance' as const,
      impact,
      weight,
      estimatedImprovement,
    });
  });

  // Process SEO issues (each audit worth ~7 points)
  pageSpeedData.seoIssues?.forEach(seo => {
    audits.push({
      auditId: seo.id,
      category: 'seo' as const,
      impact: 'medium',
      weight: 7,
      estimatedImprovement: 7,
    });
  });

  // Process accessibility issues (weighted by impact)
  pageSpeedData.accessibilityIssues?.forEach(a11y => {
    const weight = a11y.id.includes('color-contrast') ? 8 : 5; // Color contrast is heavily weighted
    audits.push({
      auditId: a11y.id,
      category: 'accessibility' as const,
      impact: weight >= 8 ? 'high' : 'medium',
      weight,
      estimatedImprovement: weight,
    });
  });

  // Add inferred best practices issues based on score
  const bestPracticesScore = pageSpeedData.scores.bestPractices;
  if (bestPracticesScore < 80) {
    audits.push({
      auditId: 'csp-xss',
      category: 'best-practices' as const,
      impact: 'high',
      weight: 6,
      estimatedImprovement: 6,
    });
  }

  // Sort by estimated improvement (highest first)
  audits.sort((a, b) => b.estimatedImprovement - a.estimatedImprovement);

  const totalPossibleImprovement = audits.reduce((sum, audit) => sum + audit.estimatedImprovement, 0);

  return {
    prioritizedAudits: audits,
    totalPossibleImprovement,
  };
}

/**
 * Enhance the optimization plan with PageSpeed-specific intelligence
 */
function enhanceOptimizationPlan(
  basePlan: OptimizationPlan,
  auditAnalysis: any,
  pageSpeedData?: OptimizationWorkflow | null
): EnhancedOptimizationPlan {
  const enhanced: EnhancedOptimizationPlan = { ...basePlan };

  if (pageSpeedData && auditAnalysis) {
    // Add prioritized audits
    enhanced.prioritizedAudits = auditAnalysis.prioritizedAudits;

    // Enhance CLS optimization based on actual CLS value
    const cls = parseFloat(pageSpeedData.coreWebVitals.cls.numericValue?.toString() || '0');
    if (cls > 0.1) {
      enhanced.clsOptimization = {
        imageDimensionInjection: true,
        fontDisplayStrategy: 'optional',
        dynamicContentReservation: true,
        estimatedCLSImprovement: Math.min(cls - 0.05, 1.0), // Expect to get to ~0.05
      };
    }

    // Enhance SEO optimization based on actual SEO score
    const seoScore = pageSpeedData.scores.seo;
    if (seoScore < 80) {
      enhanced.seoOptimization = {
        metaTagInjection: true,
        autoGenerateAltText: seoScore < 50,
        structuredDataInjection: true,
        estimatedSEOScore: Math.min(100, seoScore + (pageSpeedData.seoIssues?.length || 0) * 7),
      };
    }

    // Enhance security optimization based on Best Practices score
    const bestPracticesScore = pageSpeedData.scores.bestPractices;
    if (bestPracticesScore < 80) {
      enhanced.securityOptimization = {
        enableCSP: true,
        enableSecurityHeaders: true,
        estimatedBestPracticesScore: Math.min(100, bestPracticesScore + 30), // Security headers are high impact
      };
    }

    // Update expected performance based on audit analysis
    if (enhanced.expectedPerformance) {
      enhanced.expectedPerformance.seo = enhanced.seoOptimization?.estimatedSEOScore || seoScore;
      enhanced.expectedPerformance.bestPractices = enhanced.securityOptimization?.estimatedBestPracticesScore || bestPracticesScore;
      enhanced.expectedPerformance.cls = enhanced.clsOptimization 
        ? (cls - enhanced.clsOptimization.estimatedCLSImprovement).toString()
        : cls.toString();
    }
  }

  return enhanced;
}
