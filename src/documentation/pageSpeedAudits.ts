/**
 * PageSpeed Audits Documentation Generator
 * 
 * Generates comprehensive documentation of all PageSpeed Insights audits,
 * their optimization mappings, and AI-driven solutions.
 */

import { PERFORMANCE_AUDITS, ACCESSIBILITY_AUDITS, SEO_AUDITS, BEST_PRACTICES_AUDITS } from '../services/pagespeed/auditMappings.js';

export interface PageSpeedAudit {
  id: string;
  category: 'performance' | 'accessibility' | 'seo' | 'best-practices';
  title: string;
  description: string;
  scoreWeight?: number; // Lighthouse weighting (performance audits only)
  wcagLevel?: 'A' | 'AA' | 'AAA'; // Accessibility audits only
  impact: 'high' | 'medium' | 'low';
  mapped: boolean; // Whether we have optimization mappings
  aiActions: string[];
  codeModification?: string;
  automatable: boolean;
  estimatedImpact: number; // Expected score improvement
  implementationComplexity: 'simple' | 'moderate' | 'complex';
  commonCauses: string[];
  solutions: {
    primary: string;
    alternatives: string[];
    settingsRequired?: Record<string, unknown>;
    codeChanges?: string[];
  };
  verification: {
    automated: string[];
    manual: string[];
  };
  examples: {
    failureScenarios: string[];
    beforeAfter?: {
      before: string;
      after: string;
      improvement: string;
    };
  };
  resources: {
    lighthouseDocs?: string;
    webDevDocs?: string;
    mdnDocs?: string;
    customGuides?: string[];
  };
  lastUpdated: Date;
}

export interface AuditDocumentationOptions {
  category?: 'performance' | 'accessibility' | 'seo' | 'best-practices';
  includeUnmapped?: boolean;
}

export async function generatePageSpeedAuditsDoc(
  options: AuditDocumentationOptions = {}
): Promise<PageSpeedAudit[]> {
  const allAudits: PageSpeedAudit[] = [];

  // Performance Audits
  if (!options.category || options.category === 'performance') {
    allAudits.push(...generatePerformanceAuditsDocs());
  }

  // Accessibility Audits  
  if (!options.category || options.category === 'accessibility') {
    allAudits.push(...generateAccessibilityAuditsDocs());
  }

  // SEO Audits
  if (!options.category || options.category === 'seo') {
    allAudits.push(...generateSeoAuditsDocs());
  }

  // Best Practices Audits
  if (!options.category || options.category === 'best-practices') {
    allAudits.push(...generateBestPracticesAuditsDocs());
  }

  // Filter out unmapped audits if requested
  if (!options.includeUnmapped) {
    return allAudits.filter(audit => audit.mapped);
  }

  return allAudits;
}

function generatePerformanceAuditsDocs(): PageSpeedAudit[] {
  return [
    {
      id: 'largest-contentful-paint',
      category: 'performance',
      title: 'Largest Contentful Paint',
      description: 'Measures when the largest content element becomes visible. LCP should occur within 2.5 seconds of page start.',
      scoreWeight: 25, // 25% of performance score
      impact: 'high',
      mapped: true,
      aiActions: ['optimize-lcp-image', 'preload-lcp-resource', 'optimize-fonts', 'reduce-server-response-time'],
      codeModification: 'image-and-font-optimization',
      automatable: true,
      estimatedImpact: 15,
      implementationComplexity: 'moderate',
      commonCauses: [
        'Large, unoptimized images',
        'Slow server response times (TTFB)',
        'Render-blocking JavaScript and CSS',
        'Client-side rendering',
        'Slow resource load times'
      ],
      solutions: {
        primary: 'Optimize the LCP element (usually hero image) with compression, preloading, and format conversion',
        alternatives: [
          'Implement critical resource preloading',
          'Improve server response time',
          'Optimize font loading strategy',
          'Use CDN for faster resource delivery'
        ],
        settingsRequired: {
          'images.lcpDetection': 'auto',
          'images.lcpImageFetchPriority': true,
          'images.webp.quality': 88,
          'images.qualityTiers.hero.quality': 88,
          'images.qualityTiers.hero.lazyLoad': false
        },
        codeChanges: [
          'Add <link rel="preload" as="image" href="hero.jpg"> to <head>',
          'Add fetchpriority="high" to LCP image element',
          'Convert LCP image to modern format (WebP/AVIF)',
          'Ensure LCP image has explicit width/height attributes'
        ]
      },
      verification: {
        automated: [
          'Measure LCP via PageSpeed Insights API',
          'Confirm LCP < 2.5s threshold',
          'Verify hero image optimization applied'
        ],
        manual: [
          'Test on slow 3G network simulation',
          'Verify visual quality of optimized LCP element',
          'Check that preload links are present in <head>'
        ]
      },
      examples: {
        failureScenarios: [
          'Large hero image (2MB+) loading without optimization',
          'LCP element loaded via JavaScript after page render',
          'Server response time > 600ms delaying resource loading'
        ],
        beforeAfter: {
          before: 'LCP: 4.2s (large hero image, no preloading)',
          after: 'LCP: 1.8s (optimized WebP, preloaded, fetchpriority="high")',
          improvement: '57% LCP improvement'
        }
      },
      resources: {
        lighthouseDocs: 'https://web.dev/lcp/',
        webDevDocs: 'https://web.dev/optimize-lcp/',
        mdnDocs: 'https://developer.mozilla.org/en-US/docs/Web/API/LargestContentfulPaint',
        customGuides: ['LCP optimization for e-commerce sites', 'Hero image optimization strategies']
      },
      lastUpdated: new Date()
    },

    {
      id: 'total-blocking-time',
      category: 'performance',
      title: 'Total Blocking Time',
      description: 'Measures the total amount of time between FCP and TTI when the main thread was blocked. TBT should be under 200ms.',
      scoreWeight: 30, // 30% of performance score  
      impact: 'high',
      mapped: true,
      aiActions: ['defer-non-critical-js', 'code-split', 'remove-unused-js', 'optimize-third-party'],
      codeModification: 'javascript-optimization',
      automatable: true,
      estimatedImpact: 18,
      implementationComplexity: 'moderate',
      commonCauses: [
        'Large JavaScript bundles blocking main thread',
        'Synchronous script execution during page load',
        'Heavy JavaScript frameworks or libraries',
        'Unoptimized third-party scripts',
        'Excessive DOM manipulation during load'
      ],
      solutions: {
        primary: 'Defer non-critical JavaScript and break up large scripts into smaller chunks',
        alternatives: [
          'Use async/defer attributes on script tags',
          'Implement code splitting for large applications',
          'Remove unused JavaScript (tree shaking)',
          'Lazy load third-party widgets and embeds'
        ],
        settingsRequired: {
          'js.enabled': true,
          'js.moveScriptsToBodyEnd': true,
          'js.deferNonCritical': true,
          'js.removeUnusedJs': true
        },
        codeChanges: [
          'Move <script> tags from <head> to before </body>',
          'Add defer attribute to non-critical scripts',
          'Replace blocking scripts with async alternatives',
          'Implement lazy loading for third-party widgets'
        ]
      },
      verification: {
        automated: [
          'Measure TBT via PageSpeed Insights API',
          'Confirm TBT < 200ms threshold',
          'Check JavaScript coverage reports'
        ],
        manual: [
          'Test page interactivity during load',
          'Verify all JavaScript functionality works correctly',
          'Check browser developer tools for main thread blocking'
        ]
      },
      examples: {
        failureScenarios: [
          'Large jQuery + plugin bundle blocking main thread for 800ms',
          'Analytics and tracking scripts loading synchronously',
          'Heavy JavaScript framework initialization during page load'
        ],
        beforeAfter: {
          before: 'TBT: 850ms (blocking scripts in <head>)',
          after: 'TBT: 180ms (deferred scripts, code splitting)',
          improvement: '79% TBT reduction'
        }
      },
      resources: {
        lighthouseDocs: 'https://web.dev/tbt/',
        webDevDocs: 'https://web.dev/reduce-javascript-payloads-with-code-splitting/',
        mdnDocs: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script'
      },
      lastUpdated: new Date()
    },

    {
      id: 'cumulative-layout-shift',
      category: 'performance',
      title: 'Cumulative Layout Shift',
      description: 'Measures visual stability by quantifying unexpected layout shifts. CLS should be less than 0.1.',
      scoreWeight: 25, // 25% of performance score
      impact: 'high',
      mapped: true,
      aiActions: ['add-image-dimensions', 'reserve-ad-space', 'avoid-dynamic-content', 'optimize-font-loading'],
      codeModification: 'layout-stability',
      automatable: true,
      estimatedImpact: 12,
      implementationComplexity: 'moderate',
      commonCauses: [
        'Images without explicit dimensions',
        'Web fonts loading without fallback strategy',
        'Dynamic content injection above the fold',
        'Ads or embeds loading asynchronously',
        'CSS animations causing layout changes'
      ],
      solutions: {
        primary: 'Add explicit width and height attributes to images and reserve space for dynamic content',
        alternatives: [
          'Implement font-display: swap for web fonts',
          'Use CSS aspect-ratio for responsive images',
          'Reserve space for ads and dynamic content',
          'Preload critical fonts to prevent FOIT/FOUT'
        ],
        settingsRequired: {
          'images.addDimensions': true,
          'fonts.fontDisplay': 'swap',
          'fonts.preloadFonts': true,
          'html.reserveAdSpace': true
        },
        codeChanges: [
          'Add width="" height="" attributes to <img> tags',
          'Use CSS aspect-ratio for responsive containers',
          'Add font-display: swap to @font-face declarations',
          'Reserve vertical space for dynamically loaded content'
        ]
      },
      verification: {
        automated: [
          'Measure CLS via PageSpeed Insights API',
          'Confirm CLS < 0.1 threshold',
          'Check that images have dimensions specified'
        ],
        manual: [
          'Visually observe page loading for layout shifts',
          'Test font loading behavior across different network speeds',
          'Verify responsive behavior doesn\'t cause shifts'
        ]
      },
      examples: {
        failureScenarios: [
          'Hero image loading without dimensions causes 0.25 CLS',
          'Web font loading causes text reflow with 0.15 CLS',
          'Cookie banner appearing pushes content down by 0.12 CLS'
        ],
        beforeAfter: {
          before: 'CLS: 0.23 (images without dimensions, FOUT)',
          after: 'CLS: 0.04 (image dimensions, font-display: swap)',
          improvement: '83% CLS improvement'
        }
      },
      resources: {
        lighthouseDocs: 'https://web.dev/cls/',
        webDevDocs: 'https://web.dev/optimize-cls/',
        mdnDocs: 'https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift'
      },
      lastUpdated: new Date()
    },

    {
      id: 'render-blocking-resources',
      category: 'performance', 
      title: 'Eliminate Render-Blocking Resources',
      description: 'Identifies CSS and JavaScript files that prevent the page from rendering quickly.',
      impact: 'high',
      mapped: true,
      aiActions: ['defer-css', 'inline-critical-css', 'defer-js', 'async-js'],
      codeModification: 'resource-optimization',
      automatable: true,
      estimatedImpact: 10,
      implementationComplexity: 'moderate',
      commonCauses: [
        'CSS files loaded with blocking <link> tags',
        'JavaScript files in <head> without defer/async',
        'Large CSS frameworks loaded synchronously',
        'Font loading blocking text rendering'
      ],
      solutions: {
        primary: 'Defer non-critical CSS and JavaScript, inline critical CSS',
        alternatives: [
          'Use media="print" and switch to media="all" onload for CSS',
          'Add async/defer attributes to JavaScript',
          'Split CSS into critical and non-critical parts',
          'Use font-display: swap for web fonts'
        ],
        settingsRequired: {
          'css.extractCritical': true,
          'css.deferNonCritical': true,
          'js.deferNonCritical': true
        }
      },
      verification: {
        automated: ['Check for render-blocking resources in Lighthouse audit'],
        manual: ['Test page rendering speed with throttled network']
      },
      examples: {
        failureScenarios: ['Bootstrap CSS blocking render for 1.2s on mobile']
      },
      resources: {
        lighthouseDocs: 'https://web.dev/render-blocking-resources/'
      },
      lastUpdated: new Date()
    },

    {
      id: 'unused-css-rules',
      category: 'performance',
      title: 'Remove Unused CSS',
      description: 'Identifies CSS rules that are not used by the current page and can be removed.',
      impact: 'medium',
      mapped: true,
      aiActions: ['purge-css', 'critical-css-extraction', 'remove-unused-styles'],
      codeModification: 'css-optimization',
      automatable: true,
      estimatedImpact: 6,
      implementationComplexity: 'moderate',
      commonCauses: [
        'Large CSS frameworks with many unused rules',
        'Theme CSS containing styles for unused features',
        'Plugin CSS loaded globally but used only on specific pages'
      ],
      solutions: {
        primary: 'Use PurgeCSS to remove unused CSS rules based on HTML content analysis',
        alternatives: [
          'Manual CSS audit and cleanup',
          'Per-page CSS optimization',
          'CSS-in-JS solutions for better tree shaking'
        ],
        settingsRequired: {
          'css.purgeUnusedCss': true,
          'css.aggressiveness': 'moderate'
        }
      },
      verification: {
        automated: ['Measure CSS coverage in browser dev tools'],
        manual: ['Test all interactive states and responsive breakpoints']
      },
      examples: {
        failureScenarios: ['WordPress theme CSS 80% unused on typical pages']
      },
      resources: {
        lighthouseDocs: 'https://web.dev/unused-css-rules/'
      },
      lastUpdated: new Date()
    }
  ];
}

function generateAccessibilityAuditsDocs(): PageSpeedAudit[] {
  return [
    {
      id: 'image-alt',
      category: 'accessibility',
      title: 'Image Elements Have Alt Attributes',
      description: 'All <img> elements should have alt attributes for screen readers and accessibility.',
      wcagLevel: 'A',
      impact: 'high',
      mapped: true,
      aiActions: ['generate-alt-text', 'identify-decorative-images'],
      codeModification: 'html-accessibility',
      automatable: true,
      estimatedImpact: 15, // Accessibility score improvement
      implementationComplexity: 'simple',
      commonCauses: [
        'Images added without alt attributes',
        'CMS-generated content missing alt text',
        'Decorative images with missing alt="" attributes'
      ],
      solutions: {
        primary: 'Use AI to generate contextually relevant alt text for all images',
        alternatives: [
          'Manual review and addition of alt attributes',
          'Use empty alt="" for purely decorative images',
          'Implement CMS workflows to require alt text'
        ],
        settingsRequired: {
          'accessibility.generateAltText': true,
          'accessibility.decorativeImageDetection': true
        },
        codeChanges: [
          'Add alt="description" to <img> elements',
          'Add alt="" to decorative images',
          'Ensure alt text is contextually relevant and descriptive'
        ]
      },
      verification: {
        automated: [
          'Check all images have alt attributes',
          'Verify alt text quality with AI review'
        ],
        manual: [
          'Screen reader testing',
          'Review generated alt text for accuracy',
          'Test with images disabled in browser'
        ]
      },
      examples: {
        failureScenarios: [
          '<img src="product.jpg"> (missing alt entirely)',
          '<img src="hero.jpg" alt="image"> (meaningless alt text)'
        ],
        beforeAfter: {
          before: '<img src="laptop.jpg"> (no alt attribute)',
          after: '<img src="laptop.jpg" alt="Silver MacBook Pro on white desk with coffee cup">',
          improvement: 'Meaningful alt text provides context for screen readers'
        }
      },
      resources: {
        lighthouseDocs: 'https://web.dev/image-alt/',
        webDevDocs: 'https://web.dev/alt-text/',
        mdnDocs: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#attr-alt'
      },
      lastUpdated: new Date()
    },

    {
      id: 'button-name',
      category: 'accessibility',
      title: 'Buttons Have Accessible Names',
      description: 'All button elements should have accessible names for screen readers.',
      wcagLevel: 'A',
      impact: 'high',
      mapped: true,
      aiActions: ['add-aria-labels', 'improve-button-text'],
      codeModification: 'interactive-elements',
      automatable: true,
      estimatedImpact: 8,
      implementationComplexity: 'simple',
      commonCauses: [
        'Icon-only buttons without text or ARIA labels',
        'Generic button text like "Click here" or "More"',
        'Buttons with only background images as labels'
      ],
      solutions: {
        primary: 'Add descriptive aria-label attributes to buttons without clear text content',
        alternatives: [
          'Use aria-labelledby to reference descriptive text',
          'Include visually hidden text inside button elements',
          'Improve existing button text to be more descriptive'
        ],
        settingsRequired: {
          'accessibility.buttonLabels': true,
          'accessibility.improveButtonText': true
        },
        codeChanges: [
          'Add aria-label="description" to icon buttons',
          'Replace generic text with specific descriptions',
          'Use aria-labelledby for complex button labeling'
        ]
      },
      verification: {
        automated: ['Check all buttons have accessible names'],
        manual: ['Test with screen reader navigation']
      },
      examples: {
        failureScenarios: [
          '<button><i class="fa-search"></i></button> (icon only, no label)',
          '<button>Click here</button> (generic, non-descriptive text)'
        ]
      },
      resources: {
        lighthouseDocs: 'https://web.dev/button-name/',
        mdnDocs: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button'
      },
      lastUpdated: new Date()
    }
  ];
}

function generateSeoAuditsDocs(): PageSpeedAudit[] {
  return [
    {
      id: 'document-title',
      category: 'seo',
      title: 'Document Has a Title',
      description: 'The page should have a descriptive title element for SEO and user experience.',
      impact: 'high',
      mapped: true,
      aiActions: ['generate-title-tags', 'optimize-title-length'],
      codeModification: 'meta-optimization',
      automatable: true,
      estimatedImpact: 20,
      implementationComplexity: 'simple',
      commonCauses: [
        'Missing <title> element',
        'Generic or duplicate titles across pages',
        'Titles too long or too short for SEO'
      ],
      solutions: {
        primary: 'Generate unique, descriptive titles for each page based on content analysis',
        alternatives: [
          'Use template-based title generation',
          'Manual title optimization',
          'Dynamic title generation based on page content'
        ],
        settingsRequired: {
          'seo.generateTitles': true,
          'seo.titleLength': { min: 30, max: 60 },
          'seo.includeKeywords': true
        },
        codeChanges: [
          'Add <title>Page Title</title> to <head>',
          'Ensure titles are unique across all pages',
          'Optimize title length for search engines (30-60 chars)'
        ]
      },
      verification: {
        automated: ['Check title element exists and has appropriate length'],
        manual: ['Review titles for uniqueness and relevance']
      },
      examples: {
        beforeAfter: {
          before: '<title>Home</title> (generic, non-descriptive)',
          after: '<title>Professional Web Design Services | YourCompany</title>',
          improvement: 'Descriptive title with keywords improves SEO'
        }
      },
      resources: {
        lighthouseDocs: 'https://web.dev/document-title/',
        mdnDocs: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/title'
      },
      lastUpdated: new Date()
    }
  ];
}

function generateBestPracticesAuditsDocs(): PageSpeedAudit[] {
  return [
    {
      id: 'uses-https',
      category: 'best-practices',
      title: 'Uses HTTPS',
      description: 'All pages should be served over HTTPS for security.',
      impact: 'high',
      mapped: true,
      aiActions: ['enforce-https', 'redirect-http-to-https'],
      codeModification: 'security-headers',
      automatable: false, // Requires server configuration
      estimatedImpact: 10,
      implementationComplexity: 'simple',
      commonCauses: [
        'HTTP URLs in production',
        'Mixed content (HTTPS page loading HTTP resources)',
        'Missing HTTPS redirect rules'
      ],
      solutions: {
        primary: 'Configure server to enforce HTTPS and redirect HTTP traffic',
        alternatives: [
          'Use Cloudflare or CDN for automatic HTTPS',
          'Configure web server (Apache/Nginx) HTTPS redirects',
          'Update all internal links to use HTTPS'
        ],
        codeChanges: [
          'Add HTTPS redirect rules to server configuration',
          'Update internal links to use https:// or protocol-relative //',
          'Configure HSTS headers for enhanced security'
        ]
      },
      verification: {
        automated: ['Check if site loads over HTTPS'],
        manual: ['Test HTTP to HTTPS redirect behavior']
      },
      examples: {
        failureScenarios: ['Site accessible via both HTTP and HTTPS without redirect']
      },
      resources: {
        lighthouseDocs: 'https://web.dev/uses-https/'
      },
      lastUpdated: new Date()
    }
  ];
}

export async function getPageSpeedAudit(auditId: string): Promise<PageSpeedAudit | null> {
  const allAudits = await generatePageSpeedAuditsDoc({ includeUnmapped: true });
  return allAudits.find(audit => audit.id === auditId) || null;
}

export async function searchPageSpeedAudits(query: string): Promise<PageSpeedAudit[]> {
  const allAudits = await generatePageSpeedAuditsDoc({ includeUnmapped: true });
  const lowercaseQuery = query.toLowerCase();
  
  return allAudits.filter(audit =>
    audit.title.toLowerCase().includes(lowercaseQuery) ||
    audit.description.toLowerCase().includes(lowercaseQuery) ||
    audit.aiActions.some(action => action.toLowerCase().includes(lowercaseQuery)) ||
    audit.commonCauses.some(cause => cause.toLowerCase().includes(lowercaseQuery))
  );
}