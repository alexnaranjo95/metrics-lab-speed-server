import { fetchFullPageSpeedData } from '../services/pagespeed.js';

export interface PageSpeedVerificationResult {
  passed: boolean;
  category: 'cls' | 'seo' | 'security' | 'lcp' | 'performance';
  testName: string;
  actualValue: string | number;
  expectedValue: string | number;
  threshold: string | number;
  improvement?: string;
  details?: string;
}

export interface PageSpeedVerificationSummary {
  totalTests: number;
  passed: number;
  failed: number;
  clsTests: PageSpeedVerificationResult[];
  seoTests: PageSpeedVerificationResult[];
  securityTests: PageSpeedVerificationResult[];
  lcpTests: PageSpeedVerificationResult[];
  overallScore: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  recommendations: string[];
}

/**
 * Comprehensive PageSpeed verification for optimized sites
 * Validates CLS fixes, SEO improvements, security headers, and LCP optimization
 */
export async function verifyPageSpeedOptimizations(
  optimizedUrl: string,
  originalUrl: string,
  log: (msg: string) => void
): Promise<PageSpeedVerificationSummary> {
  log('Fetching PageSpeed data for verification...');
  
  const [optimizedData, originalData] = await Promise.all([
    fetchFullPageSpeedData(optimizedUrl, 'mobile').catch(() => null),
    fetchFullPageSpeedData(originalUrl, 'mobile').catch(() => null),
  ]);

  if (!optimizedData) {
    log('⚠️  Could not fetch PageSpeed data for optimized site');
    return createEmptyVerificationSummary();
  }

  const results: PageSpeedVerificationResult[] = [];
  
  // CLS Verification Tests
  results.push(...verifyCLSOptimizations(optimizedData, originalData, log));
  
  // SEO Verification Tests  
  results.push(...verifySEOOptimizations(optimizedData, originalData, log));
  
  // Security Headers Verification
  results.push(...verifySecurityOptimizations(optimizedUrl, log));
  
  // LCP Verification Tests
  results.push(...verifyLCPOptimizations(optimizedData, originalData, log));

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  const summary: PageSpeedVerificationSummary = {
    totalTests: results.length,
    passed,
    failed,
    clsTests: results.filter(r => r.category === 'cls'),
    seoTests: results.filter(r => r.category === 'seo'),
    securityTests: results.filter(r => r.category === 'security'),
    lcpTests: results.filter(r => r.category === 'lcp'),
    overallScore: {
      performance: optimizedData.scores.performance,
      accessibility: optimizedData.scores.accessibility,
      bestPractices: optimizedData.scores.bestPractices,
      seo: optimizedData.scores.seo,
    },
    recommendations: generateRecommendations(results),
  };

  logVerificationSummary(summary, log);
  
  return summary;
}

/**
 * Verify CLS (Cumulative Layout Shift) optimizations
 */
function verifyCLSOptimizations(
  optimizedData: any,
  originalData: any,
  log: (msg: string) => void
): PageSpeedVerificationResult[] {
  const results: PageSpeedVerificationResult[] = [];
  
  const optimizedCLS = parseFloat(optimizedData.coreWebVitals.cls.numericValue?.toString() || '0');
  const originalCLS = originalData ? parseFloat(originalData.coreWebVitals.cls.numericValue?.toString() || '0') : null;
  
  log(`CLS verification: optimized=${optimizedCLS.toFixed(3)}, original=${originalCLS?.toFixed(3) || 'N/A'}`);

  // Test 1: CLS should be under "Good" threshold (≤ 0.1)
  results.push({
    passed: optimizedCLS <= 0.1,
    category: 'cls',
    testName: 'CLS Good Threshold',
    actualValue: optimizedCLS.toFixed(3),
    expectedValue: '≤ 0.1',
    threshold: 0.1,
    details: optimizedCLS <= 0.1 ? 'CLS is in "Good" range' : 'CLS exceeds "Good" threshold'
  });

  // Test 2: CLS should be significantly improved from original (if we have baseline)
  if (originalCLS !== null && originalCLS > 0) {
    const improvement = ((originalCLS - optimizedCLS) / originalCLS) * 100;
    results.push({
      passed: improvement >= 50, // Expect at least 50% improvement
      category: 'cls',
      testName: 'CLS Improvement',
      actualValue: `${improvement.toFixed(1)}%`,
      expectedValue: '≥ 50%',
      threshold: 50,
      improvement: `${(originalCLS - optimizedCLS).toFixed(3)} reduction`,
      details: `Improved from ${originalCLS.toFixed(3)} to ${optimizedCLS.toFixed(3)}`
    });
  }

  // Test 3: CLS should not be in "Poor" range (> 0.25)
  results.push({
    passed: optimizedCLS <= 0.25,
    category: 'cls',
    testName: 'CLS Poor Threshold',
    actualValue: optimizedCLS.toFixed(3),
    expectedValue: '≤ 0.25',
    threshold: 0.25,
    details: optimizedCLS <= 0.25 ? 'CLS not in "Poor" range' : 'CLS is in "Poor" range - critical issue'
  });

  return results;
}

/**
 * Verify SEO optimizations
 */
function verifySEOOptimizations(
  optimizedData: any,
  originalData: any,
  log: (msg: string) => void
): PageSpeedVerificationResult[] {
  const results: PageSpeedVerificationResult[] = [];
  
  const optimizedSEO = optimizedData.scores.seo;
  const originalSEO = originalData ? originalData.scores.seo : null;
  
  log(`SEO verification: optimized=${optimizedSEO}, original=${originalSEO || 'N/A'}`);

  // Test 1: SEO score should be excellent (≥ 90)
  results.push({
    passed: optimizedSEO >= 90,
    category: 'seo',
    testName: 'SEO Score Excellence',
    actualValue: optimizedSEO,
    expectedValue: '≥ 90',
    threshold: 90,
    details: optimizedSEO >= 90 ? 'SEO score is excellent' : 'SEO score needs improvement'
  });

  // Test 2: SEO score should be significantly improved (if we have baseline)
  if (originalSEO !== null) {
    const improvement = optimizedSEO - originalSEO;
    results.push({
      passed: improvement >= 20, // Expect at least 20 point improvement
      category: 'seo',
      testName: 'SEO Score Improvement',
      actualValue: improvement,
      expectedValue: '≥ 20',
      threshold: 20,
      improvement: `+${improvement} points`,
      details: `Improved from ${originalSEO} to ${optimizedSEO}`
    });
  }

  // Test 3: Check specific SEO audits are passing
  const seoAudits = [
    'viewport',
    'document-title', 
    'meta-description',
    'image-alt',
    'link-text',
    'crawlable-anchors',
  ];

  seoAudits.forEach(auditId => {
    const audit = optimizedData.lighthouseResult?.audits?.[auditId];
    if (audit) {
      results.push({
        passed: audit.score === 1,
        category: 'seo',
        testName: `SEO: ${audit.title || auditId}`,
        actualValue: audit.score === 1 ? 'Pass' : 'Fail',
        expectedValue: 'Pass',
        threshold: 1,
        details: audit.score === 1 ? undefined : audit.description
      });
    }
  });

  return results;
}

/**
 * Verify security optimizations (headers)
 */
async function verifySecurityOptimizations(
  optimizedUrl: string,
  log: (msg: string) => void
): Promise<PageSpeedVerificationResult[]> {
  const results: PageSpeedVerificationResult[] = [];
  
  log('Verifying security headers...');
  
  try {
    const response = await fetch(optimizedUrl, { method: 'HEAD' });
    const headers = Object.fromEntries(
      [...response.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])
    );

    // Test 1: Content-Security-Policy with trusted types
    const csp = headers['content-security-policy'];
    const hasTrustedTypes = csp?.includes("require-trusted-types-for 'script'");
    results.push({
      passed: !!hasTrustedTypes,
      category: 'security',
      testName: 'CSP Trusted Types',
      actualValue: hasTrustedTypes ? 'Present' : 'Missing',
      expectedValue: 'Present',
      threshold: 'Present',
      details: 'require-trusted-types-for \'script\' directive required for Best Practices'
    });

    // Test 2: X-Content-Type-Options
    results.push({
      passed: headers['x-content-type-options'] === 'nosniff',
      category: 'security',
      testName: 'X-Content-Type-Options',
      actualValue: headers['x-content-type-options'] || 'Missing',
      expectedValue: 'nosniff',
      threshold: 'nosniff',
      details: 'Prevents MIME type sniffing attacks'
    });

    // Test 3: X-Frame-Options or CSP frame-ancestors
    const hasFrameProtection = 
      headers['x-frame-options'] ||
      csp?.includes('frame-ancestors');
    results.push({
      passed: !!hasFrameProtection,
      category: 'security',
      testName: 'Frame Protection',
      actualValue: hasFrameProtection ? 'Present' : 'Missing',
      expectedValue: 'Present',
      threshold: 'Present',
      details: 'Prevents clickjacking attacks'
    });

    // Test 4: Strict-Transport-Security
    const hsts = headers['strict-transport-security'];
    results.push({
      passed: !!hsts && hsts.includes('max-age='),
      category: 'security',
      testName: 'HSTS',
      actualValue: hsts ? 'Present' : 'Missing',
      expectedValue: 'Present',
      threshold: 'Present',
      details: 'Forces HTTPS connections'
    });

  } catch (error) {
    log(`Security header verification failed: ${(error as Error).message}`);
    results.push({
      passed: false,
      category: 'security',
      testName: 'Security Headers Check',
      actualValue: 'Failed to fetch',
      expectedValue: 'Accessible',
      threshold: 'Accessible',
      details: `Could not verify headers: ${(error as Error).message}`
    });
  }

  return results;
}

/**
 * Verify LCP (Largest Contentful Paint) optimizations
 */
function verifyLCPOptimizations(
  optimizedData: any,
  originalData: any,
  log: (msg: string) => void
): PageSpeedVerificationResult[] {
  const results: PageSpeedVerificationResult[] = [];
  
  const optimizedLCP = parseFloat(optimizedData.coreWebVitals.lcp.numericValue?.toString() || '0');
  const originalLCP = originalData ? parseFloat(originalData.coreWebVitals.lcp.numericValue?.toString() || '0') : null;
  
  log(`LCP verification: optimized=${(optimizedLCP/1000).toFixed(1)}s, original=${originalLCP ? (originalLCP/1000).toFixed(1) + 's' : 'N/A'}`);

  // Test 1: LCP should be under "Good" threshold (≤ 2.5s)
  results.push({
    passed: optimizedLCP <= 2500,
    category: 'lcp',
    testName: 'LCP Good Threshold',
    actualValue: `${(optimizedLCP/1000).toFixed(1)}s`,
    expectedValue: '≤ 2.5s',
    threshold: 2500,
    details: optimizedLCP <= 2500 ? 'LCP is in "Good" range' : 'LCP exceeds "Good" threshold'
  });

  // Test 2: LCP should be improved from original (if we have baseline)
  if (originalLCP !== null && originalLCP > 0) {
    const improvement = ((originalLCP - optimizedLCP) / originalLCP) * 100;
    results.push({
      passed: improvement >= 20, // Expect at least 20% improvement
      category: 'lcp',
      testName: 'LCP Improvement',
      actualValue: `${improvement.toFixed(1)}%`,
      expectedValue: '≥ 20%',
      threshold: 20,
      improvement: `${((originalLCP - optimizedLCP)/1000).toFixed(1)}s reduction`,
      details: `Improved from ${(originalLCP/1000).toFixed(1)}s to ${(optimizedLCP/1000).toFixed(1)}s`
    });
  }

  return results;
}

/**
 * Generate recommendations based on failed tests
 */
function generateRecommendations(results: PageSpeedVerificationResult[]): string[] {
  const recommendations: string[] = [];
  const failedTests = results.filter(r => !r.passed);

  failedTests.forEach(test => {
    switch (test.testName) {
      case 'CLS Good Threshold':
        recommendations.push('Enable CLS optimization: image dimension injection, font-display: optional, dynamic content reservation');
        break;
      case 'SEO Score Excellence':
        recommendations.push('Enable comprehensive SEO optimization: meta tags, alt attributes, structured data');
        break;
      case 'CSP Trusted Types':
        recommendations.push('Add Content-Security-Policy with require-trusted-types-for \'script\' directive');
        break;
      case 'LCP Good Threshold':
        recommendations.push('Enable LCP optimization: AVIF images, fetchpriority="high", image preloading');
        break;
      default:
        if (test.details) {
          recommendations.push(`Fix ${test.testName}: ${test.details}`);
        }
    }
  });

  return [...new Set(recommendations)]; // Remove duplicates
}

/**
 * Log verification summary
 */
function logVerificationSummary(summary: PageSpeedVerificationSummary, log: (msg: string) => void): void {
  log(`PageSpeed Verification: ${summary.passed}/${summary.totalTests} tests passed`);
  log(`Scores - Performance: ${summary.overallScore.performance}, SEO: ${summary.overallScore.seo}, Best Practices: ${summary.overallScore.bestPractices}`);
  
  if (summary.clsTests.length > 0) {
    const clsPassed = summary.clsTests.filter(t => t.passed).length;
    log(`CLS Tests: ${clsPassed}/${summary.clsTests.length} passed`);
  }
  
  if (summary.seoTests.length > 0) {
    const seoPassed = summary.seoTests.filter(t => t.passed).length;
    log(`SEO Tests: ${seoPassed}/${summary.seoTests.length} passed`);
  }
  
  if (summary.securityTests.length > 0) {
    const secPassed = summary.securityTests.filter(t => t.passed).length;
    log(`Security Tests: ${secPassed}/${summary.securityTests.length} passed`);
  }

  if (summary.failed > 0) {
    log(`Recommendations: ${summary.recommendations.join('; ')}`);
  }
}

/**
 * Create empty verification summary when PageSpeed data unavailable
 */
function createEmptyVerificationSummary(): PageSpeedVerificationSummary {
  return {
    totalTests: 0,
    passed: 0,
    failed: 0,
    clsTests: [],
    seoTests: [],
    securityTests: [],
    lcpTests: [],
    overallScore: {
      performance: 0,
      accessibility: 0,
      bestPractices: 0,
      seo: 0,
    },
    recommendations: ['Could not fetch PageSpeed data for verification'],
  };
}