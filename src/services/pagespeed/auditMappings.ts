/**
 * PageSpeed Insights audit ID → AI action mapping.
 * Maps each failing audit to specific code modifications.
 */

export interface AuditMapping {
  aiActions: string[];
  codeModification?: string;
  threshold?: { good: number; poor: number };
}

// ─── Performance Audits ────────────────────────────────────────────

export const PERFORMANCE_AUDITS: Record<string, AuditMapping> = {
  'largest-contentful-paint': {
    threshold: { good: 2500, poor: 4000 },
    aiActions: ['optimize-lcp-image', 'preload-lcp-resource', 'optimize-fonts'],
    codeModification: 'image-and-font-optimization',
  },
  'total-blocking-time': {
    threshold: { good: 200, poor: 600 },
    aiActions: ['defer-non-critical-js', 'code-split', 'remove-unused-js'],
    codeModification: 'javascript-optimization',
  },
  'cumulative-layout-shift': {
    threshold: { good: 0.1, poor: 0.25 },
    aiActions: ['add-image-dimensions', 'reserve-ad-space', 'avoid-dynamic-content'],
    codeModification: 'layout-stability',
  },
  'first-contentful-paint': {
    threshold: { good: 1800, poor: 3000 },
    aiActions: ['optimize-critical-css', 'eliminate-render-blocking', 'preload-fonts'],
    codeModification: 'critical-path',
  },
  'speed-index': {
    threshold: { good: 3400, poor: 5800 },
    aiActions: ['progressive-loading', 'above-fold-optimization', 'lazy-load-images'],
    codeModification: 'visual-progress',
  },
  'render-blocking-resources': {
    aiActions: ['defer-css', 'defer-js', 'extract-critical-css'],
    codeModification: 'html-head-optimization',
  },
  'unused-css-rules': {
    aiActions: ['purge-css', 'critical-css-extraction'],
    codeModification: 'css-tree-shaking',
  },
  'unused-javascript': {
    aiActions: ['tree-shake-js', 'code-splitting', 'dynamic-imports'],
    codeModification: 'javascript-optimization',
  },
  'uses-optimized-images': {
    aiActions: ['convert-webp', 'compress-images', 'responsive-images'],
    codeModification: 'image-pipeline',
  },
  'modern-image-formats': {
    aiActions: ['avif-conversion', 'webp-with-fallback'],
    codeModification: 'picture-element-generation',
  },
  'uses-responsive-images': {
    aiActions: ['generate-srcset', 'art-direction', 'density-descriptors'],
    codeModification: 'responsive-image-markup',
  },
  'efficiently-encode-images': {
    aiActions: ['image-compression', 'format-optimization'],
    codeModification: 'automated-image-processing',
  },
  'uses-text-compression': {
    aiActions: ['enable-gzip', 'enable-brotli'],
    codeModification: 'server-configuration',
  },
  'uses-rel-preconnect': {
    aiActions: ['add-preconnect-hints', 'dns-prefetch'],
    codeModification: 'html-head-resource-hints',
  },
  'uses-rel-preload': {
    aiActions: ['preload-critical-resources', 'font-preloading'],
    codeModification: 'resource-prioritization',
  },
};

// ─── Accessibility Audits ──────────────────────────────────────────

export const ACCESSIBILITY_AUDITS: Record<string, AuditMapping> = {
  'button-name': { aiActions: ['add-aria-labels', 'button-text-content'], codeModification: 'accessibility-attributes' },
  'link-name': { aiActions: ['descriptive-link-text', 'aria-label-links'], codeModification: 'link-accessibility' },
  'image-alt': { aiActions: ['generate-alt-text', 'decorative-image-alt'], codeModification: 'image-alt-attributes' },
  'input-image-alt': { aiActions: ['input-alt-text'], codeModification: 'form-accessibility' },
  'form-field-multiple-labels': { aiActions: ['fix-label-associations'], codeModification: 'form-label-optimization' },
  'label': { aiActions: ['associate-labels', 'programmatic-labels'], codeModification: 'form-accessibility' },
  'color-contrast': { aiActions: ['improve-contrast-ratios', 'color-scheme-optimization'], codeModification: 'css-contrast-fixes' },
  'focusable-controls': { aiActions: ['add-tabindex', 'keyboard-navigation'], codeModification: 'keyboard-accessibility' },
  'focus-traps': { aiActions: ['implement-focus-management'], codeModification: 'modal-accessibility' },
  'aria-allowed-attr': { aiActions: ['fix-aria-attributes'], codeModification: 'aria-compliance' },
  'aria-required-attr': { aiActions: ['add-required-aria'], codeModification: 'aria-completion' },
  'aria-valid-attr-value': { aiActions: ['validate-aria-values'], codeModification: 'aria-validation' },
  'heading-order': { aiActions: ['restructure-headings', 'semantic-hierarchy'], codeModification: 'heading-structure' },
  'list': { aiActions: ['semantic-list-markup'], codeModification: 'list-structure' },
};

// ─── SEO Audits ────────────────────────────────────────────────────

export const SEO_AUDITS: Record<string, AuditMapping> = {
  'document-title': { aiActions: ['generate-seo-title', 'title-optimization'], codeModification: 'meta-title-generation' },
  'meta-description': { aiActions: ['generate-meta-description', 'description-optimization'], codeModification: 'meta-description-generation' },
  'http-status-code': { aiActions: ['fix-redirect-chains', 'resolve-4xx-errors'], codeModification: 'server-configuration' },
  'is-crawlable': { aiActions: ['remove-crawl-blocks', 'robots-optimization'], codeModification: 'robots-txt-fixes' },
  'robots-txt': { aiActions: ['optimize-robots-txt'], codeModification: 'robots-file-generation' },
  'canonical': { aiActions: ['add-canonical-tags', 'prevent-duplicate-content'], codeModification: 'canonical-url-optimization' },
  'hreflang': { aiActions: ['add-hreflang-tags', 'international-seo'], codeModification: 'multilingual-optimization' },
  'structured-data': { aiActions: ['add-schema-markup', 'json-ld-generation'], codeModification: 'structured-data-injection' },
};

// ─── Best Practices Audits ──────────────────────────────────────────

export const BEST_PRACTICES_AUDITS: Record<string, AuditMapping> = {
  'uses-https': { aiActions: ['force-https-redirects', 'ssl-configuration'], codeModification: 'security-headers' },
  'uses-http2': { aiActions: ['enable-http2', 'server-upgrade'], codeModification: 'server-configuration' },
  'no-vulnerable-libraries': { aiActions: ['update-dependencies', 'security-patches'], codeModification: 'dependency-updates' },
  'charset': { aiActions: ['add-charset-meta'], codeModification: 'html-meta-optimization' },
  'doctype': { aiActions: ['add-html5-doctype'], codeModification: 'html-structure-fixes' },
  'deprecations': { aiActions: ['remove-deprecated-apis', 'modernize-code'], codeModification: 'code-modernization' },
  'errors-in-console': { aiActions: ['fix-javascript-errors', 'console-cleanup'], codeModification: 'error-resolution' },
};
