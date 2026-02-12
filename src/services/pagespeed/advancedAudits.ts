/**
 * Advanced PageSpeed Audits Coverage
 * 
 * Comprehensive mapping of ALL possible PageSpeed Insights audits to AI-driven solutions.
 * This extends the basic audit mappings with complete coverage of every audit type.
 */

export interface AdvancedAuditMapping {
  id: string;
  category: 'performance' | 'accessibility' | 'seo' | 'best-practices' | 'pwa';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  weight?: number; // Performance audits only
  wcagLevel?: 'A' | 'AA' | 'AAA'; // Accessibility audits only
  aiActions: string[];
  codeModification: string;
  automationLevel: 'fully-automated' | 'semi-automated' | 'manual-review';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  prerequisites: string[];
  verificationSteps: string[];
  commonCauses: string[];
  diagnosticSteps: string[];
  solutionComplexity: 'simple' | 'moderate' | 'complex';
  estimatedTime: number; // Minutes to implement
  rollbackComplexity: 'simple' | 'moderate' | 'complex';
}

/**
 * PERFORMANCE AUDITS - Complete coverage of all performance-related audits
 */
export const PERFORMANCE_AUDITS_ADVANCED: AdvancedAuditMapping[] = [
  {
    id: 'largest-contentful-paint',
    category: 'performance',
    title: 'Largest Contentful Paint',
    description: 'Measures when the largest content element becomes visible',
    impact: 'high',
    weight: 25,
    aiActions: [
      'optimize-lcp-image',
      'preload-lcp-resource', 
      'optimize-fonts',
      'reduce-server-response-time',
      'eliminate-render-blocking-resources',
      'minify-css',
      'optimize-images',
      'serve-static-assets-efficiently'
    ],
    codeModification: 'lcp-optimization',
    automationLevel: 'fully-automated',
    riskLevel: 'low',
    prerequisites: ['identify-lcp-element', 'measure-baseline'],
    verificationSteps: [
      'Measure LCP with PageSpeed Insights',
      'Verify LCP < 2.5s on mobile',
      'Check visual quality of optimized element',
      'Validate preload links in HTML head'
    ],
    commonCauses: [
      'Large unoptimized images',
      'Slow server response times',
      'Render-blocking CSS/JS',
      'Client-side rendering delays'
    ],
    diagnosticSteps: [
      'Identify LCP element using browser dev tools',
      'Check image size and format',
      'Measure TTFB and server response',
      'Analyze render-blocking resources',
      'Check for lazy loading conflicts'
    ],
    solutionComplexity: 'moderate',
    estimatedTime: 15,
    rollbackComplexity: 'simple'
  },

  {
    id: 'total-blocking-time',
    category: 'performance',
    title: 'Total Blocking Time',
    description: 'Measures main thread blocking time between FCP and TTI',
    impact: 'high',
    weight: 30,
    aiActions: [
      'defer-non-critical-js',
      'code-split-large-bundles',
      'remove-unused-js',
      'optimize-third-party-scripts',
      'reduce-javascript-execution-time',
      'minimize-main-thread-work',
      'break-up-long-tasks'
    ],
    codeModification: 'javascript-optimization',
    automationLevel: 'semi-automated',
    riskLevel: 'medium',
    prerequisites: ['analyze-js-bundles', 'identify-blocking-scripts'],
    verificationSteps: [
      'Measure TBT with lighthouse',
      'Verify TBT < 200ms',
      'Test all interactive functionality',
      'Check console for JS errors'
    ],
    commonCauses: [
      'Large JavaScript bundles',
      'Synchronous script execution',
      'Heavy third-party scripts',
      'Unoptimized framework code'
    ],
    diagnosticSteps: [
      'Analyze main thread activity in dev tools',
      'Identify long tasks (>50ms)',
      'Check JavaScript coverage',
      'Audit third-party script impact',
      'Profile script execution times'
    ],
    solutionComplexity: 'complex',
    estimatedTime: 45,
    rollbackComplexity: 'moderate'
  },

  {
    id: 'cumulative-layout-shift',
    category: 'performance',
    title: 'Cumulative Layout Shift',
    description: 'Measures visual stability by tracking unexpected layout shifts',
    impact: 'high',
    weight: 25,
    aiActions: [
      'add-image-dimensions',
      'reserve-ad-space',
      'avoid-dynamic-content-injection',
      'optimize-font-loading',
      'set-explicit-sizes',
      'preload-critical-fonts'
    ],
    codeModification: 'layout-stability',
    automationLevel: 'fully-automated',
    riskLevel: 'low',
    prerequisites: ['identify-layout-shift-elements'],
    verificationSteps: [
      'Measure CLS with PageSpeed',
      'Verify CLS < 0.1',
      'Visual test across viewports',
      'Check font loading behavior'
    ],
    commonCauses: [
      'Images without dimensions',
      'Web fonts loading without fallback',
      'Dynamic content insertion',
      'Ads without reserved space'
    ],
    diagnosticSteps: [
      'Use Layout Instability API',
      'Identify shifting elements',
      'Check image dimension attributes',
      'Audit font-display settings',
      'Test with slow network conditions'
    ],
    solutionComplexity: 'simple',
    estimatedTime: 10,
    rollbackComplexity: 'simple'
  },

  {
    id: 'render-blocking-resources',
    category: 'performance',
    title: 'Eliminate render-blocking resources',
    description: 'Remove or defer resources that block initial page render',
    impact: 'high',
    aiActions: [
      'defer-non-critical-css',
      'inline-critical-css',
      'defer-javascript',
      'async-javascript',
      'eliminate-blocking-stylesheets'
    ],
    codeModification: 'render-blocking-optimization',
    automationLevel: 'semi-automated',
    riskLevel: 'medium',
    prerequisites: ['identify-critical-css', 'analyze-js-dependencies'],
    verificationSteps: [
      'Check for render-blocking resources',
      'Verify critical CSS is inlined',
      'Test visual completeness',
      'Validate functionality'
    ],
    commonCauses: [
      'CSS in <head> without media queries',
      'JavaScript in <head> without defer/async',
      'Large CSS frameworks',
      'Synchronous font loading'
    ],
    diagnosticSteps: [
      'Identify render-blocking resources',
      'Extract critical above-fold CSS',
      'Determine JS execution dependencies',
      'Analyze font loading impact'
    ],
    solutionComplexity: 'complex',
    estimatedTime: 30,
    rollbackComplexity: 'moderate'
  },

  {
    id: 'unused-css-rules',
    category: 'performance',
    title: 'Remove unused CSS',
    description: 'Remove CSS rules that are not used by the page',
    impact: 'medium',
    aiActions: [
      'purge-unused-css',
      'extract-critical-css',
      'remove-unused-selectors',
      'optimize-css-delivery'
    ],
    codeModification: 'css-optimization',
    automationLevel: 'semi-automated',
    riskLevel: 'high',
    prerequisites: ['analyze-css-usage', 'identify-dynamic-classes'],
    verificationSteps: [
      'Check CSS coverage in dev tools',
      'Test all page states and interactions',
      'Verify responsive design',
      'Check third-party widget styles'
    ],
    commonCauses: [
      'Large CSS frameworks',
      'Unused theme styles',
      'Legacy CSS code',
      'Over-inclusive selectors'
    ],
    diagnosticSteps: [
      'Run CSS coverage analysis',
      'Identify unused selectors',
      'Check dynamic class usage',
      'Analyze media query usage'
    ],
    solutionComplexity: 'complex',
    estimatedTime: 60,
    rollbackComplexity: 'complex'
  },

  {
    id: 'unused-javascript',
    category: 'performance',
    title: 'Remove unused JavaScript',
    description: 'Remove JavaScript code that is not executed',
    impact: 'medium',
    aiActions: [
      'tree-shake-javascript',
      'remove-dead-code',
      'code-split-unused-modules',
      'dynamic-import-optimization'
    ],
    codeModification: 'javascript-tree-shaking',
    automationLevel: 'semi-automated',
    riskLevel: 'high',
    prerequisites: ['analyze-js-coverage', 'identify-entry-points'],
    verificationSteps: [
      'Check JavaScript coverage',
      'Test all interactive features',
      'Verify conditional code paths',
      'Check for runtime errors'
    ],
    commonCauses: [
      'Large JavaScript libraries',
      'Unused framework features',
      'Dead code paths',
      'Over-inclusive bundles'
    ],
    diagnosticSteps: [
      'Run JS coverage analysis',
      'Identify unused functions',
      'Check conditional execution',
      'Analyze bundle composition'
    ],
    solutionComplexity: 'complex',
    estimatedTime: 90,
    rollbackComplexity: 'complex'
  },

  {
    id: 'uses-optimized-images',
    category: 'performance',
    title: 'Efficiently encode images',
    description: 'Optimize images with modern formats and compression',
    impact: 'medium',
    aiActions: [
      'convert-to-webp',
      'convert-to-avif',
      'optimize-image-compression',
      'generate-responsive-images',
      'remove-image-metadata'
    ],
    codeModification: 'image-optimization',
    automationLevel: 'fully-automated',
    riskLevel: 'low',
    prerequisites: ['inventory-images', 'check-browser-support'],
    verificationSteps: [
      'Verify image formats and sizes',
      'Check visual quality',
      'Test fallback mechanisms',
      'Validate responsive behavior'
    ],
    commonCauses: [
      'Unoptimized image formats',
      'Oversized images',
      'Missing compression',
      'No responsive images'
    ],
    diagnosticSteps: [
      'Audit image sizes and formats',
      'Check compression ratios',
      'Analyze usage patterns',
      'Test different devices'
    ],
    solutionComplexity: 'simple',
    estimatedTime: 20,
    rollbackComplexity: 'simple'
  },

  {
    id: 'uses-text-compression',
    category: 'performance',
    title: 'Enable text compression',
    description: 'Compress text-based resources with gzip or brotli',
    impact: 'medium',
    aiActions: [
      'enable-gzip-compression',
      'enable-brotli-compression',
      'configure-compression-levels',
      'optimize-compression-settings'
    ],
    codeModification: 'server-configuration',
    automationLevel: 'manual-review',
    riskLevel: 'low',
    prerequisites: ['server-access', 'compression-support-check'],
    verificationSteps: [
      'Check compression headers',
      'Verify file size reduction',
      'Test across different browsers',
      'Monitor server performance'
    ],
    commonCauses: [
      'Server not configured for compression',
      'Missing compression headers',
      'Incorrect MIME types',
      'Compression not enabled for all text files'
    ],
    diagnosticSteps: [
      'Check response headers',
      'Test compression tools',
      'Analyze server configuration',
      'Check file types included'
    ],
    solutionComplexity: 'simple',
    estimatedTime: 10,
    rollbackComplexity: 'simple'
  },

  {
    id: 'uses-responsive-images',
    category: 'performance',
    title: 'Properly size images',
    description: 'Serve appropriately-sized images for different devices',
    impact: 'medium',
    aiActions: [
      'generate-responsive-images',
      'implement-srcset',
      'add-sizes-attribute',
      'optimize-art-direction'
    ],
    codeModification: 'responsive-images',
    automationLevel: 'fully-automated',
    riskLevel: 'low',
    prerequisites: ['analyze-image-usage', 'determine-breakpoints'],
    verificationSteps: [
      'Test images across devices',
      'Verify appropriate sizes load',
      'Check srcset implementation',
      'Validate sizes attribute'
    ],
    commonCauses: [
      'Fixed-size images',
      'Missing srcset attributes',
      'Incorrect sizes values',
      'No art direction'
    ],
    diagnosticSteps: [
      'Check image dimensions vs display size',
      'Analyze srcset usage',
      'Test across viewports',
      'Check browser selection'
    ],
    solutionComplexity: 'moderate',
    estimatedTime: 25,
    rollbackComplexity: 'simple'
  },

  {
    id: 'offscreen-images',
    category: 'performance',
    title: 'Defer offscreen images',
    description: 'Implement lazy loading for below-fold images',
    impact: 'medium',
    aiActions: [
      'implement-lazy-loading',
      'add-loading-attribute',
      'configure-intersection-observer',
      'optimize-lazy-loading-threshold'
    ],
    codeModification: 'lazy-loading-implementation',
    automationLevel: 'fully-automated',
    riskLevel: 'low',
    prerequisites: ['identify-above-fold-images'],
    verificationSteps: [
      'Verify lazy loading works',
      'Check loading="lazy" attributes',
      'Test scroll behavior',
      'Validate LCP not affected'
    ],
    commonCauses: [
      'All images load eagerly',
      'Missing loading attributes',
      'No lazy loading library',
      'Poor loading threshold'
    ],
    diagnosticSteps: [
      'Identify offscreen images',
      'Check current loading behavior',
      'Test network requests',
      'Analyze scroll patterns'
    ],
    solutionComplexity: 'simple',
    estimatedTime: 15,
    rollbackComplexity: 'simple'
  }
];

/**
 * ACCESSIBILITY AUDITS - Complete coverage of WCAG compliance audits
 */
export const ACCESSIBILITY_AUDITS_ADVANCED: AdvancedAuditMapping[] = [
  {
    id: 'image-alt',
    category: 'accessibility',
    title: 'Image elements have [alt] attributes',
    description: 'All images should have alt attributes for screen readers',
    impact: 'high',
    wcagLevel: 'A',
    aiActions: [
      'generate-alt-text-from-context',
      'identify-decorative-images',
      'create-meaningful-descriptions',
      'add-empty-alt-for-decorative'
    ],
    codeModification: 'alt-text-generation',
    automationLevel: 'semi-automated',
    riskLevel: 'low',
    prerequisites: ['image-content-analysis', 'context-understanding'],
    verificationSteps: [
      'Check all images have alt attributes',
      'Verify alt text quality and relevance',
      'Test with screen reader',
      'Check decorative images have empty alt'
    ],
    commonCauses: [
      'Images added without alt text',
      'CMS not requiring alt text',
      'Decorative images with missing alt=""',
      'Dynamic images without alt generation'
    ],
    diagnosticSteps: [
      'Scan all img elements',
      'Check for missing alt attributes',
      'Analyze image content and context',
      'Identify decorative vs informative images'
    ],
    solutionComplexity: 'moderate',
    estimatedTime: 30,
    rollbackComplexity: 'simple'
  },

  {
    id: 'button-name',
    category: 'accessibility',
    title: 'Buttons have an accessible name',
    description: 'All button elements should have accessible names',
    impact: 'high',
    wcagLevel: 'A',
    aiActions: [
      'add-aria-labels-to-buttons',
      'improve-button-text',
      'add-accessible-descriptions',
      'fix-icon-only-buttons'
    ],
    codeModification: 'button-accessibility',
    automationLevel: 'semi-automated',
    riskLevel: 'low',
    prerequisites: ['button-functionality-analysis', 'context-understanding'],
    verificationSteps: [
      'Check all buttons have accessible names',
      'Test with screen reader navigation',
      'Verify button purpose is clear',
      'Check icon buttons have labels'
    ],
    commonCauses: [
      'Icon-only buttons without labels',
      'Generic button text',
      'Missing aria-label attributes',
      'Buttons with only background images'
    ],
    diagnosticSteps: [
      'Find all button elements',
      'Check for accessible names',
      'Analyze button context and purpose',
      'Test screen reader announcements'
    ],
    solutionComplexity: 'simple',
    estimatedTime: 20,
    rollbackComplexity: 'simple'
  },

  {
    id: 'color-contrast',
    category: 'accessibility',
    title: 'Background and foreground colors have sufficient contrast ratio',
    description: 'Text should have adequate color contrast for readability',
    impact: 'high',
    wcagLevel: 'AA',
    aiActions: [
      'analyze-color-contrast-ratios',
      'suggest-accessible-colors',
      'adjust-text-colors',
      'modify-background-colors'
    ],
    codeModification: 'color-contrast-optimization',
    automationLevel: 'semi-automated',
    riskLevel: 'medium',
    prerequisites: ['color-analysis', 'brand-guideline-consideration'],
    verificationSteps: [
      'Check contrast ratios meet WCAG AA (4.5:1)',
      'Verify brand colors are preserved',
      'Test with color blindness simulators',
      'Check all text elements'
    ],
    commonCauses: [
      'Low contrast color choices',
      'Light text on light backgrounds',
      'Brand colors not accessible',
      'Dynamic color generation'
    ],
    diagnosticSteps: [
      'Measure contrast ratios',
      'Identify failing text elements',
      'Check brand color usage',
      'Test across different themes'
    ],
    solutionComplexity: 'moderate',
    estimatedTime: 45,
    rollbackComplexity: 'moderate'
  },

  {
    id: 'heading-order',
    category: 'accessibility',
    title: 'Heading elements appear in a sequentially-descending order',
    description: 'Heading hierarchy should be logical and sequential',
    impact: 'medium',
    wcagLevel: 'AA',
    aiActions: [
      'analyze-heading-structure',
      'fix-heading-hierarchy',
      'adjust-heading-levels',
      'maintain-semantic-structure'
    ],
    codeModification: 'heading-structure-optimization',
    automationLevel: 'semi-automated',
    riskLevel: 'low',
    prerequisites: ['content-structure-analysis'],
    verificationSteps: [
      'Check heading order is sequential',
      'Verify no heading levels are skipped',
      'Test with screen reader navigation',
      'Check visual hierarchy matches semantic hierarchy'
    ],
    commonCauses: [
      'Styling-based heading choices',
      'Skipped heading levels',
      'Multiple h1 elements',
      'Non-semantic heading usage'
    ],
    diagnosticSteps: [
      'Audit heading structure',
      'Check for skipped levels',
      'Analyze content hierarchy',
      'Test navigation patterns'
    ],
    solutionComplexity: 'moderate',
    estimatedTime: 25,
    rollbackComplexity: 'simple'
  },

  {
    id: 'link-name',
    category: 'accessibility',
    title: 'Links have a discernible name',
    description: 'All link elements should have accessible names',
    impact: 'high',
    wcagLevel: 'A',
    aiActions: [
      'add-descriptive-link-text',
      'improve-link-context',
      'add-aria-labels-to-links',
      'fix-empty-links'
    ],
    codeModification: 'link-accessibility',
    automationLevel: 'semi-automated',
    riskLevel: 'low',
    prerequisites: ['link-destination-analysis', 'context-understanding'],
    verificationSteps: [
      'Check all links have discernible names',
      'Verify link purposes are clear',
      'Test with screen reader',
      'Check link context provides sufficient information'
    ],
    commonCauses: [
      'Generic link text ("click here", "read more")',
      'Links with only icons',
      'Empty link elements',
      'Unclear link purposes'
    ],
    diagnosticSteps: [
      'Find all link elements',
      'Check link text content',
      'Analyze link destinations',
      'Test link announcements'
    ],
    solutionComplexity: 'simple',
    estimatedTime: 20,
    rollbackComplexity: 'simple'
  }
];

/**
 * SEO AUDITS - Complete coverage of search engine optimization audits
 */
export const SEO_AUDITS_ADVANCED: AdvancedAuditMapping[] = [
  {
    id: 'document-title',
    category: 'seo',
    title: 'Document has a <title> element',
    description: 'Page should have a descriptive, unique title',
    impact: 'high',
    aiActions: [
      'generate-descriptive-titles',
      'optimize-title-length',
      'include-target-keywords',
      'ensure-title-uniqueness'
    ],
    codeModification: 'title-optimization',
    automationLevel: 'semi-automated',
    riskLevel: 'low',
    prerequisites: ['content-analysis', 'keyword-research'],
    verificationSteps: [
      'Check title element exists',
      'Verify title is descriptive and unique',
      'Check title length (30-60 characters)',
      'Ensure keywords are included appropriately'
    ],
    commonCauses: [
      'Missing title element',
      'Generic or duplicate titles',
      'Titles too long or too short',
      'No keywords in title'
    ],
    diagnosticSteps: [
      'Check for title element',
      'Analyze title content',
      'Compare with other pages',
      'Check keyword inclusion'
    ],
    solutionComplexity: 'simple',
    estimatedTime: 10,
    rollbackComplexity: 'simple'
  },

  {
    id: 'meta-description',
    category: 'seo',
    title: 'Document has a meta description',
    description: 'Page should have a compelling meta description',
    impact: 'medium',
    aiActions: [
      'generate-meta-descriptions',
      'optimize-description-length',
      'include-call-to-action',
      'ensure-description-uniqueness'
    ],
    codeModification: 'meta-description-optimization',
    automationLevel: 'semi-automated',
    riskLevel: 'low',
    prerequisites: ['content-summarization', 'target-audience-analysis'],
    verificationSteps: [
      'Check meta description exists',
      'Verify description length (120-160 characters)',
      'Ensure description is compelling',
      'Check uniqueness across pages'
    ],
    commonCauses: [
      'Missing meta description',
      'Generic or duplicate descriptions',
      'Descriptions too long or too short',
      'No compelling value proposition'
    ],
    diagnosticSteps: [
      'Check for meta description tag',
      'Analyze description content',
      'Compare with other pages',
      'Test search result appearance'
    ],
    solutionComplexity: 'simple',
    estimatedTime: 15,
    rollbackComplexity: 'simple'
  },

  {
    id: 'structured-data',
    category: 'seo',
    title: 'Structured data is valid',
    description: 'Implement proper schema.org markup',
    impact: 'medium',
    aiActions: [
      'add-structured-data-markup',
      'implement-schema-org',
      'validate-structured-data',
      'optimize-rich-snippets'
    ],
    codeModification: 'structured-data-implementation',
    automationLevel: 'semi-automated',
    riskLevel: 'low',
    prerequisites: ['content-type-identification', 'schema-selection'],
    verificationSteps: [
      'Validate structured data with testing tools',
      'Check for appropriate schema types',
      'Verify markup accuracy',
      'Test rich snippet appearance'
    ],
    commonCauses: [
      'Missing structured data',
      'Incorrect schema implementation',
      'Invalid markup syntax',
      'Inappropriate schema types'
    ],
    diagnosticSteps: [
      'Check for existing structured data',
      'Validate markup with Google tools',
      'Analyze content for schema opportunities',
      'Test rich snippet eligibility'
    ],
    solutionComplexity: 'moderate',
    estimatedTime: 30,
    rollbackComplexity: 'simple'
  },

  {
    id: 'hreflang',
    category: 'seo',
    title: 'Document has valid hreflang',
    description: 'Implement proper international targeting',
    impact: 'medium',
    aiActions: [
      'add-hreflang-attributes',
      'configure-international-targeting',
      'validate-language-codes',
      'implement-canonical-urls'
    ],
    codeModification: 'international-seo',
    automationLevel: 'semi-automated',
    riskLevel: 'medium',
    prerequisites: ['multi-language-detection', 'regional-targeting-analysis'],
    verificationSteps: [
      'Check hreflang implementation',
      'Verify language and region codes',
      'Test international search results',
      'Validate canonical URL relationships'
    ],
    commonCauses: [
      'Missing hreflang attributes',
      'Incorrect language codes',
      'Mismatched regional targeting',
      'No canonical URL specification'
    ],
    diagnosticSteps: [
      'Check for hreflang attributes',
      'Validate language/region codes',
      'Analyze international content structure',
      'Test search result targeting'
    ],
    solutionComplexity: 'complex',
    estimatedTime: 45,
    rollbackComplexity: 'moderate'
  }
];

/**
 * BEST PRACTICES AUDITS - Security and modern web standards
 */
export const BEST_PRACTICES_AUDITS_ADVANCED: AdvancedAuditMapping[] = [
  {
    id: 'uses-https',
    category: 'best-practices',
    title: 'Uses HTTPS',
    description: 'Ensure all pages are served over HTTPS',
    impact: 'high',
    aiActions: [
      'configure-https-redirect',
      'update-internal-links',
      'fix-mixed-content',
      'implement-hsts'
    ],
    codeModification: 'https-implementation',
    automationLevel: 'manual-review',
    riskLevel: 'low',
    prerequisites: ['ssl-certificate-setup', 'server-configuration-access'],
    verificationSteps: [
      'Check HTTPS is properly configured',
      'Verify HTTP redirects to HTTPS',
      'Check for mixed content warnings',
      'Test HSTS headers'
    ],
    commonCauses: [
      'HTTP-only hosting',
      'Missing SSL certificate',
      'No HTTPS redirect',
      'Mixed content issues'
    ],
    diagnosticSteps: [
      'Check current protocol usage',
      'Test HTTPS availability',
      'Check for mixed content',
      'Verify redirect behavior'
    ],
    solutionComplexity: 'moderate',
    estimatedTime: 30,
    rollbackComplexity: 'simple'
  },

  {
    id: 'csp-xss',
    category: 'best-practices',
    title: 'Content Security Policy',
    description: 'Implement CSP to prevent XSS attacks',
    impact: 'high',
    aiActions: [
      'generate-csp-headers',
      'configure-trusted-sources',
      'implement-nonce-based-csp',
      'validate-csp-effectiveness'
    ],
    codeModification: 'csp-implementation',
    automationLevel: 'semi-automated',
    riskLevel: 'medium',
    prerequisites: ['security-requirements-analysis', 'third-party-script-audit'],
    verificationSteps: [
      'Check CSP header presence',
      'Verify policy effectiveness',
      'Test for CSP violations',
      'Check trusted source configuration'
    ],
    commonCauses: [
      'No CSP header',
      'Overly permissive policy',
      'Inline scripts without nonces',
      'Third-party script conflicts'
    ],
    diagnosticSteps: [
      'Check for CSP headers',
      'Analyze current script usage',
      'Test policy violations',
      'Audit third-party dependencies'
    ],
    solutionComplexity: 'complex',
    estimatedTime: 60,
    rollbackComplexity: 'moderate'
  },

  {
    id: 'external-anchors-use-rel-noopener',
    category: 'best-practices',
    title: 'Links to cross-origin destinations are safe',
    description: 'External links should use rel="noopener" for security',
    impact: 'medium',
    aiActions: [
      'add-rel-noopener',
      'audit-external-links',
      'implement-link-security',
      'validate-target-blank-usage'
    ],
    codeModification: 'link-security',
    automationLevel: 'fully-automated',
    riskLevel: 'low',
    prerequisites: ['external-link-identification'],
    verificationSteps: [
      'Check all external links have rel="noopener"',
      'Verify target="_blank" links are secure',
      'Test link behavior',
      'Check for security warnings'
    ],
    commonCauses: [
      'Missing rel="noopener" on external links',
      'Unsafe target="_blank" usage',
      'No security consideration for external links',
      'Legacy link implementations'
    ],
    diagnosticSteps: [
      'Find all external links',
      'Check rel attribute usage',
      'Test target="_blank" behavior',
      'Audit link security'
    ],
    solutionComplexity: 'simple',
    estimatedTime: 10,
    rollbackComplexity: 'simple'
  }
];

/**
 * PWA AUDITS - Progressive Web App capabilities
 */
export const PWA_AUDITS_ADVANCED: AdvancedAuditMapping[] = [
  {
    id: 'installable-manifest',
    category: 'pwa',
    title: 'Web app manifest meets installability requirements',
    description: 'Provide a complete web app manifest for installation',
    impact: 'high',
    aiActions: [
      'generate-web-app-manifest',
      'configure-manifest-properties',
      'add-manifest-link',
      'optimize-install-experience'
    ],
    codeModification: 'pwa-manifest',
    automationLevel: 'semi-automated',
    riskLevel: 'low',
    prerequisites: ['app-identity-definition', 'icon-asset-preparation'],
    verificationSteps: [
      'Check manifest.json exists and is valid',
      'Verify all required properties',
      'Test installation prompt',
      'Check manifest link in HTML'
    ],
    commonCauses: [
      'Missing web app manifest',
      'Incomplete manifest properties',
      'Invalid manifest JSON',
      'Missing manifest link'
    ],
    diagnosticSteps: [
      'Check for manifest file',
      'Validate manifest properties',
      'Test installation eligibility',
      'Check browser support'
    ],
    solutionComplexity: 'moderate',
    estimatedTime: 25,
    rollbackComplexity: 'simple'
  },

  {
    id: 'service-worker',
    category: 'pwa',
    title: 'Registers a service worker',
    description: 'Implement service worker for offline functionality',
    impact: 'high',
    aiActions: [
      'generate-service-worker',
      'implement-caching-strategy',
      'configure-offline-fallbacks',
      'register-service-worker'
    ],
    codeModification: 'service-worker-implementation',
    automationLevel: 'semi-automated',
    riskLevel: 'medium',
    prerequisites: ['caching-strategy-planning', 'offline-requirements-analysis'],
    verificationSteps: [
      'Check service worker registration',
      'Verify caching strategy works',
      'Test offline functionality',
      'Check service worker updates'
    ],
    commonCauses: [
      'No service worker implementation',
      'Incorrect service worker registration',
      'Poor caching strategy',
      'Missing offline fallbacks'
    ],
    diagnosticSteps: [
      'Check service worker registration',
      'Test caching behavior',
      'Analyze offline functionality',
      'Check update mechanisms'
    ],
    solutionComplexity: 'complex',
    estimatedTime: 90,
    rollbackComplexity: 'moderate'
  }
];

/**
 * Get all advanced audit mappings
 */
export function getAllAdvancedAudits(): AdvancedAuditMapping[] {
  return [
    ...PERFORMANCE_AUDITS_ADVANCED,
    ...ACCESSIBILITY_AUDITS_ADVANCED,
    ...SEO_AUDITS_ADVANCED,
    ...BEST_PRACTICES_AUDITS_ADVANCED,
    ...PWA_AUDITS_ADVANCED
  ];
}

/**
 * Get audit mapping by ID
 */
export function getAdvancedAuditMapping(auditId: string): AdvancedAuditMapping | undefined {
  return getAllAdvancedAudits().find(audit => audit.id === auditId);
}

/**
 * Get audits by category
 */
export function getAuditsByCategory(category: AdvancedAuditMapping['category']): AdvancedAuditMapping[] {
  return getAllAdvancedAudits().filter(audit => audit.category === category);
}

/**
 * Get high-impact audits
 */
export function getHighImpactAudits(): AdvancedAuditMapping[] {
  return getAllAdvancedAudits().filter(audit => audit.impact === 'high');
}

/**
 * Get audits by automation level
 */
export function getAuditsByAutomation(level: AdvancedAuditMapping['automationLevel']): AdvancedAuditMapping[] {
  return getAllAdvancedAudits().filter(audit => audit.automationLevel === level);
}

/**
 * Get audits by risk level
 */
export function getAuditsByRisk(riskLevel: AdvancedAuditMapping['riskLevel']): AdvancedAuditMapping[] {
  return getAllAdvancedAudits().filter(audit => audit.riskLevel === riskLevel);
}