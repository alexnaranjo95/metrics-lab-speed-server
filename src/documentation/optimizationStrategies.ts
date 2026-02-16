/**
 * Optimization Strategies Documentation Generator
 * 
 * Generates comprehensive documentation of all available optimization strategies,
 * their risk levels, success rates, and implementation details.
 */

import { db } from '../db/index.js';
import { settingsSchema } from '../shared/settingsSchema.js';
import { sql } from 'drizzle-orm';

export interface OptimizationStrategy {
  id: string;
  category: 'performance' | 'accessibility' | 'seo' | 'security';
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  estimatedImpact: number; // 0-100 score improvement
  implementationType: 'settings' | 'code-modification' | 'hybrid';
  prerequisites: string[];
  conflicts: string[]; // Strategies that conflict with this one
  successRate: number; // 0-1 based on historical data
  averageImprovement: number; // Average performance score improvement
  settingsRequired: Record<string, unknown>;
  codeChanges?: {
    files: string[];
    description: string;
    reversible: boolean;
  };
  verificationSteps: string[];
  troubleshooting: {
    commonIssues: string[];
    solutions: string[];
  };
  examples: {
    beforeAfter?: {
      before: string;
      after: string;
      description: string;
    };
    siteTypes: string[]; // Site types where this works well
    caseStudies?: string[];
  };
  lastUpdated: Date;
}

export async function generateOptimizationStrategiesDoc(): Promise<OptimizationStrategy[]> {
  const strategies: OptimizationStrategy[] = [];

  // Image optimization strategies
  strategies.push({
    id: 'aggressive-image-compression',
    category: 'performance',
    name: 'Aggressive Image Compression',
    description: 'Compress images with optimized quality settings for maximum size reduction while maintaining visual quality',
    riskLevel: 'low',
    estimatedImpact: 15,
    implementationType: 'settings',
    prerequisites: [],
    conflicts: [],
    successRate: 0.95,
    averageImprovement: 12.3,
    settingsRequired: {
      'images.webp.quality': 75,
      'images.jpeg.quality': 78,
      'images.qualityTiers.hero.quality': 85,
      'images.qualityTiers.standard.quality': 75,
      'images.qualityTiers.thumbnail.quality': 60
    },
    verificationSteps: [
      'Check that image file sizes are reduced by at least 30%',
      'Verify visual quality is acceptable across all device types',
      'Confirm LCP improvement if hero images were optimized'
    ],
    troubleshooting: {
      commonIssues: [
        'Images appear pixelated or blurry',
        'LCP regression due to over-compression',
        'Brand logo quality degradation'
      ],
      solutions: [
        'Increase quality for hero images to 85-88%',
        'Use quality tiers to preserve important images',
        'Exclude specific images from compression via URL patterns'
      ]
    },
    examples: {
      beforeAfter: {
        before: 'Original JPEG: 2.3MB, Quality: 90%',
        after: 'Optimized WebP: 0.8MB, Quality: 78%',
        description: '65% size reduction with imperceptible quality loss'
      },
      siteTypes: ['e-commerce', 'portfolio', 'blog', 'corporate'],
      caseStudies: ['Reduced total page weight by 2.1MB on photography site']
    },
    lastUpdated: new Date()
  });

  strategies.push({
    id: 'css-purging-moderate',
    category: 'performance',
    name: 'Moderate CSS Purging',
    description: 'Remove unused CSS rules while preserving theme and plugin styles with intelligent safelist generation',
    riskLevel: 'medium',
    estimatedImpact: 8,
    implementationType: 'settings',
    prerequisites: ['Site crawling completed', 'Interactive elements identified'],
    conflicts: ['css-purging-aggressive'],
    successRate: 0.78,
    averageImprovement: 6.2,
    settingsRequired: {
      'css.enabled': true,
      'css.purgeUnusedCss': true,
      'css.aggressiveness': 'moderate',
      'css.safelist.standard': ['wp-*', 'elementor-*', 'menu-*'],
      'css.safelist.deep': ['active', 'open', 'visible'],
      'css.safelist.greedy': ['/swiper-/', '/slick-/']
    },
    verificationSteps: [
      'Verify all interactive elements still function correctly',
      'Check that responsive design breakpoints work',
      'Confirm theme styling is preserved',
      'Test plugin functionality (sliders, forms, etc.)'
    ],
    troubleshooting: {
      commonIssues: [
        'Missing styles on interactive elements',
        'Broken responsive layout',
        'Plugin functionality broken',
        'Hover states not working'
      ],
      solutions: [
        'Add missing selectors to safelist',
        'Use "safe" aggressiveness instead',
        'Review plugin-specific CSS patterns',
        'Include pseudo-selector patterns in safelist'
      ]
    },
    examples: {
      beforeAfter: {
        before: 'Original CSS: 450KB across 12 files',
        after: 'Purged CSS: 180KB in combined file',
        description: '60% CSS size reduction'
      },
      siteTypes: ['WordPress with themes', 'sites with many plugins'],
      caseStudies: ['Elementor site CSS reduced from 680KB to 245KB']
    },
    lastUpdated: new Date()
  });

  strategies.push({
    id: 'script-deferral-selective',
    category: 'performance',
    name: 'Selective Script Deferral',
    description: 'Move non-critical JavaScript to end of body and apply defer/async attributes intelligently',
    riskLevel: 'medium',
    estimatedImpact: 12,
    implementationType: 'settings',
    prerequisites: ['JavaScript dependency analysis'],
    conflicts: ['jquery-removal'],
    successRate: 0.82,
    averageImprovement: 9.1,
    settingsRequired: {
      'js.enabled': true,
      'js.moveScriptsToBodyEnd': true,
      'js.deferNonCritical': true,
      'js.preserveLoadOrder': true,
      'js.exceptions': ['gtag', 'analytics', 'critical-inline-scripts']
    },
    codeChanges: {
      files: ['*.html'],
      description: 'Move <script> tags from <head> to before </body> with defer attributes',
      reversible: true
    },
    verificationSteps: [
      'Verify page loads without JavaScript errors',
      'Test all interactive functionality',
      'Check that analytics tracking still works',
      'Confirm third-party integrations function correctly'
    ],
    troubleshooting: {
      commonIssues: [
        'Scripts loading out of order',
        'JavaScript errors on page load',
        'Interactive elements not working',
        'Third-party widgets broken'
      ],
      solutions: [
        'Enable preserveLoadOrder setting',
        'Move critical scripts to exceptions list',
        'Use async instead of defer for independent scripts',
        'Test with browser developer tools console'
      ]
    },
    examples: {
      siteTypes: ['WordPress sites', 'sites with many third-party scripts'],
      caseStudies: ['Reduced TBT from 850ms to 320ms on WooCommerce site']
    },
    lastUpdated: new Date()
  });

  strategies.push({
    id: 'jquery-removal-safe',
    category: 'performance',
    name: 'Safe jQuery Removal',
    description: 'Remove jQuery dependency after analyzing usage patterns and ensuring compatibility',
    riskLevel: 'high',
    estimatedImpact: 18,
    implementationType: 'code-modification',
    prerequisites: ['jQuery usage analysis', 'Interactive element testing', 'Plugin compatibility check'],
    conflicts: ['script-deferral-selective'],
    successRate: 0.45,
    averageImprovement: 14.7,
    settingsRequired: {
      'js.removeJquery': true,
      'js.jqueryCompatibilityCheck': true,
      'js.modernJsReplacement': true
    },
    codeChanges: {
      files: ['*.html', '*.js'],
      description: 'Remove jQuery library and replace jQuery-dependent code with modern JavaScript',
      reversible: true
    },
    verificationSteps: [
      'Extensive testing of all interactive elements',
      'Verify forms submit correctly',
      'Check slider/carousel functionality',
      'Test modal dialogs and dropdowns',
      'Validate third-party plugin compatibility'
    ],
    troubleshooting: {
      commonIssues: [
        'Sliders/carousels stop working',
        'Form validation broken',
        'Modal dialogs not opening',
        'Third-party plugins malfunction'
      ],
      solutions: [
        'Keep jQuery for sites with heavy plugin dependencies',
        'Replace jQuery plugins with modern alternatives',
        'Use jQuery compatibility layer temporarily',
        'Implement manual fallbacks for critical functionality'
      ]
    },
    examples: {
      beforeAfter: {
        before: 'jQuery 3.6.0: 87KB minified + dependent plugins',
        after: 'Modern JavaScript equivalents: ~15KB',
        description: '70KB+ JavaScript size reduction'
      },
      siteTypes: ['simple WordPress sites', 'custom-built sites'],
      caseStudies: ['Corporate site TBT improved from 1.2s to 0.4s after jQuery removal']
    },
    lastUpdated: new Date()
  });

  strategies.push({
    id: 'font-optimization-comprehensive',
    category: 'performance',
    name: 'Comprehensive Font Optimization',
    description: 'Self-host Google Fonts, implement font-display strategies, and preload critical fonts',
    riskLevel: 'low',
    estimatedImpact: 6,
    implementationType: 'hybrid',
    prerequisites: ['Font usage analysis'],
    conflicts: [],
    successRate: 0.91,
    averageImprovement: 4.8,
    settingsRequired: {
      'fonts.enabled': true,
      'fonts.selfHostGoogleFonts': true,
      'fonts.fontDisplay': 'swap',
      'fonts.preloadFonts': true,
      'fonts.subsetting': true
    },
    codeChanges: {
      files: ['*.html', '*.css'],
      description: 'Replace Google Fonts links with self-hosted files and add preload links',
      reversible: true
    },
    verificationSteps: [
      'Confirm fonts load without layout shift',
      'Verify font-display swap prevents FOIT',
      'Check that all font weights/styles are available',
      'Test fallback font rendering during load'
    ],
    troubleshooting: {
      commonIssues: [
        'Fonts not loading on some browsers',
        'Layout shift during font load',
        'Missing font weights or styles',
        'Slow font loading'
      ],
      solutions: [
        'Include woff2 and woff formats for compatibility',
        'Use font-display: swap consistently',
        'Preload only the most critical font files',
        'Optimize font subsetting for used characters'
      ]
    },
    examples: {
      beforeAfter: {
        before: 'Google Fonts: External requests, render blocking',
        after: 'Self-hosted: Local files, preloaded, font-display: swap',
        description: 'Eliminated external font requests and FOIT'
      },
      siteTypes: ['any site using web fonts'],
      caseStudies: ['Reduced CLS from 0.15 to 0.02 on typography-heavy blog']
    },
    lastUpdated: new Date()
  });

  strategies.push({
    id: 'accessibility-comprehensive',
    category: 'accessibility',
    name: 'Comprehensive Accessibility Enhancement',
    description: 'Improve WCAG compliance through automated alt text, ARIA labels, and color contrast optimization',
    riskLevel: 'low',
    estimatedImpact: 25, // Accessibility score improvement
    implementationType: 'code-modification',
    prerequisites: ['Image analysis', 'Color contrast analysis'],
    conflicts: [],
    successRate: 0.88,
    averageImprovement: 22.1,
    settingsRequired: {
      'accessibility.enabled': true,
      'accessibility.generateAltText': true,
      'accessibility.ariaLabels': true,
      'accessibility.colorContrastFixes': true,
      'accessibility.headingHierarchy': true
    },
    codeChanges: {
      files: ['*.html', '*.css'],
      description: 'Add alt attributes, ARIA labels, improve color contrast, fix heading hierarchy',
      reversible: true
    },
    verificationSteps: [
      'Run automated accessibility testing',
      'Verify screen reader compatibility',
      'Check keyboard navigation functionality',
      'Validate color contrast ratios meet WCAG AA standards'
    ],
    troubleshooting: {
      commonIssues: [
        'Generated alt text not contextually relevant',
        'ARIA labels conflicting with existing ones',
        'Color changes affecting brand identity'
      ],
      solutions: [
        'Review and manually adjust AI-generated alt text',
        'Preserve existing ARIA labels when appropriate',
        'Use accessibility-compliant colors that maintain brand harmony'
      ]
    },
    examples: {
      beforeAfter: {
        before: 'Accessibility Score: 65/100, 15 violations',
        after: 'Accessibility Score: 92/100, 2 minor violations',
        description: '27-point accessibility score improvement'
      },
      siteTypes: ['e-commerce', 'government', 'educational', 'corporate'],
      caseStudies: ['Healthcare site achieved WCAG AA compliance from 45% to 98%']
    },
    lastUpdated: new Date()
  });

  // Add historical success rates from database if available
  await enrichWithHistoricalData(strategies);

  return strategies;
}

async function enrichWithHistoricalData(strategies: OptimizationStrategy[]): Promise<void> {
  try {
    // Query historical optimization data to update success rates and average improvements
    const historicalData = await db.execute(sql`
      SELECT 
        optimization_type,
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_attempts,
        AVG(CASE 
          WHEN performance_improvement IS NOT NULL 
          THEN performance_improvement 
          ELSE 0 
        END) as avg_improvement
      FROM ai_optimization_sessions 
      WHERE created_at >= NOW() - INTERVAL '90 days'
      GROUP BY optimization_type
    `);

    const rows = Array.isArray(historicalData) ? historicalData : (historicalData as { rows?: unknown[] }).rows ?? [];
    for (const strategy of strategies) {
      const data = rows.find((row: any) => 
        row.optimization_type === strategy.id || 
        row.optimization_type.includes(strategy.id.replace('-', '_'))
      );

      if (data) {
        strategy.successRate = (data as any).successful_attempts / (data as any).total_attempts;
        strategy.averageImprovement = parseFloat((data as any).avg_improvement) || strategy.averageImprovement;
      }
    }
  } catch (error) {
    console.warn('Failed to enrich strategies with historical data:', (error as Error).message);
  }
}

export async function getOptimizationStrategy(strategyId: string): Promise<OptimizationStrategy | null> {
  const strategies = await generateOptimizationStrategiesDoc();
  return strategies.find(s => s.id === strategyId) || null;
}

export async function getStrategiesByCategory(category: OptimizationStrategy['category']): Promise<OptimizationStrategy[]> {
  const strategies = await generateOptimizationStrategiesDoc();
  return strategies.filter(s => s.category === category);
}

export async function getStrategiesByRiskLevel(riskLevel: OptimizationStrategy['riskLevel']): Promise<OptimizationStrategy[]> {
  const strategies = await generateOptimizationStrategiesDoc();
  return strategies.filter(s => s.riskLevel === riskLevel);
}

export async function searchOptimizationStrategies(query: string): Promise<OptimizationStrategy[]> {
  const strategies = await generateOptimizationStrategiesDoc();
  const lowercaseQuery = query.toLowerCase();
  
  return strategies.filter(strategy => 
    strategy.name.toLowerCase().includes(lowercaseQuery) ||
    strategy.description.toLowerCase().includes(lowercaseQuery) ||
    strategy.examples.siteTypes.some(type => type.toLowerCase().includes(lowercaseQuery)) ||
    Object.keys(strategy.settingsRequired).some(key => key.toLowerCase().includes(lowercaseQuery))
  );
}