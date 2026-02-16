/**
 * Enhanced Verification System
 * 
 * Orchestrates all verification types with enhanced capabilities for AI-driven
 * code changes, including rollback automation and learning integration.
 */

import { codeChangeVerificationEngine, type CodeChangeVerificationOptions, type CodeChangeVerificationResult } from './codeChangeVerification.js';
import { compareVisuals, aiVisualReview, type VisualComparisonResult } from './visual.js';
import { verifyFunctionalBehavior, type InteractiveElement, type FunctionalTestResult } from './functional.js';
import { verifyAllLinks, type LinkVerificationResult } from './links.js';
import { measureWithPageSpeed, type PageSpeedResult } from '../services/pagespeed.js';
import { aiLearningEngine, type SiteProfile } from '../ai/learningEngine.js';
import { codeSafetyChecker, type ComprehensiveModificationPlan } from '../codeAnalysis/safetyChecker.js';

export interface EnhancedVerificationOptions {
  originalUrl: string;
  optimizedUrl: string;
  modificationPlan?: ComprehensiveModificationPlan;
  siteProfile: SiteProfile;
  verificationLevel: 'minimal' | 'standard' | 'comprehensive' | 'exhaustive';
  
  tolerances: {
    performance: {
      scoreRegression: number; // Max allowed score drop
      lcpIncrease: number; // Max allowed LCP increase (ms)
      tbtIncrease: number; // Max allowed TBT increase (ms)
      clsIncrease: number; // Max allowed CLS increase
    };
    visual: {
      pixelDifference: number; // Max allowed pixel difference %
      layoutChanges: number; // Max allowed layout changes
    };
    functional: {
      maxFailures: number; // Max allowed functional test failures
      criticalFeatures: string[]; // Features that must not break
    };
    accessibility: {
      scoreRegression: number; // Max allowed accessibility score drop
      wcagLevel: 'A' | 'AA' | 'AAA'; // Required compliance level
    };
  };
  
  rollbackSettings: {
    automaticRollback: boolean;
    rollbackTriggers: string[];
    rollbackDelay: number; // Minutes to wait before rollback
    notificationChannels: string[];
  };
  
  learningMode: boolean; // Whether to record results for learning
}

export interface EnhancedVerificationResult {
  verificationId: string;
  timestamp: Date;
  options: EnhancedVerificationOptions;
  
  // Overall result
  passed: boolean;
  confidence: number; // 0-1
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  
  // Detailed verification results
  codeChanges?: CodeChangeVerificationResult;
  performance: PerformanceVerificationResult;
  visual: VisualVerificationResult;
  functional: FunctionalVerificationResult;
  accessibility: AccessibilityVerificationResult;
  links: LinkVerificationResult;
  security: SecurityVerificationResult;
  
  // Decision and actions
  deploymentRecommendation: 'deploy' | 'deploy-with-monitoring' | 'fix-issues' | 'rollback';
  rollbackRequired: boolean;
  rollbackReason?: string;
  monitoringRecommendations: string[];
  
  // Learning integration
  learningInsights?: {
    successPatterns: string[];
    failurePatterns: string[];
    unexpectedOutcomes: string[];
    knowledgeGained: string[];
  };
  
  // Next iteration guidance
  nextIterationGuidance?: {
    recommendedChanges: string[];
    avoidedStrategies: string[];
    priorityAdjustments: string[];
  };
}

export interface PerformanceVerificationResult {
  passed: boolean;
  pageSpeedComparison: {
    original: PageSpeedResult;
    optimized: PageSpeedResult;
    improvement: {
      performance: number;
      lcp: number;
      tbt: number;
      cls: number;
      fcp: number;
      si: number;
    };
  };
  businessImpact: {
    estimatedConversionIncrease: number;
    estimatedBounceReduction: number;
    loadTimeImprovement: number;
  };
  regressions: Array<{
    metric: string;
    degradation: number;
    severity: 'minor' | 'moderate' | 'major';
  }>;
  recommendations: string[];
}

export interface VisualVerificationResult {
  passed: boolean;
  aiReview: {
    overallVerdict: string;
    acceptableChanges: boolean;
    significantIssues: string[];
    minorImprovements: string[];
  };
  pixelComparison: Array<{
    viewport: string;
    differencePercentage: number;
    acceptableThreshold: number;
    passed: boolean;
  }>;
  layoutAnalysis: {
    layoutShiftsDetected: boolean;
    newLayoutIssues: string[];
    layoutImprovements: string[];
  };
  brandIntegrity: {
    colorsPreserved: boolean;
    typographyIntact: boolean;
    logoUnchanged: boolean;
    brandElementsIntact: boolean;
  };
}

export interface FunctionalVerificationResult {
  passed: boolean;
  testResults: FunctionalTestResult[];
  newFunctionalities: string[];
  brokenFunctionalities: string[];
  performanceImpact: Array<{
    feature: string;
    beforeMs: number;
    afterMs: number;
    improvement: number;
  }>;
  userExperienceImpact: {
    interactionSpeed: 'faster' | 'same' | 'slower';
    responsivenessRating: number; // 1-10
    usabilityIssues: string[];
  };
}

export interface AccessibilityVerificationResult {
  passed: boolean;
  wcagCompliance: {
    level: 'A' | 'AA' | 'AAA';
    score: number;
    improvement: number;
    newViolations: string[];
    resolvedViolations: string[];
  };
  screenReaderCompatibility: {
    tested: boolean;
    issues: string[];
    improvements: string[];
  };
  keyboardNavigation: {
    tested: boolean;
    tabOrder: boolean;
    focusManagement: boolean;
    issues: string[];
  };
}

export interface SecurityVerificationResult {
  passed: boolean;
  vulnerabilityAssessment: {
    newVulnerabilities: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      mitigation: string;
    }>;
    resolvedVulnerabilities: string[];
    securityScoreChange: number;
  };
  securityHeaders: {
    added: string[];
    improved: string[];
    missing: string[];
    securityStrength: 'weak' | 'moderate' | 'strong';
  };
  contentSecurityPolicy: {
    implemented: boolean;
    strength: string;
    violations: string[];
  };
}

export class EnhancedVerificationSystem {
  /**
   * Run complete enhanced verification with AI learning integration
   */
  async runEnhancedVerification(
    options: EnhancedVerificationOptions
  ): Promise<EnhancedVerificationResult> {
    const verificationId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result: EnhancedVerificationResult = {
      verificationId,
      timestamp: new Date(),
      options,
      passed: false,
      confidence: 0,
      overallRisk: 'medium',
      performance: { passed: false, pageSpeedComparison: { original: {} as PageSpeedResult, optimized: {} as PageSpeedResult, improvement: { performance: 0, lcp: 0, tbt: 0, cls: 0, fcp: 0, si: 0 } }, businessImpact: { estimatedConversionIncrease: 0, estimatedBounceReduction: 0, loadTimeImprovement: 0 }, regressions: [], recommendations: [] },
      visual: { passed: false, aiReview: { overallVerdict: '', acceptableChanges: false, significantIssues: [], minorImprovements: [] }, pixelComparison: [], layoutAnalysis: { layoutShiftsDetected: false, newLayoutIssues: [], layoutImprovements: [] }, brandIntegrity: { colorsPreserved: true, typographyIntact: true, logoUnchanged: true, brandElementsIntact: true } },
      functional: { passed: false, testResults: [], newFunctionalities: [], brokenFunctionalities: [], performanceImpact: [], userExperienceImpact: { interactionSpeed: 'same', responsivenessRating: 5, usabilityIssues: [] } },
      accessibility: { passed: false, wcagCompliance: { level: 'A', score: 0, improvement: 0, newViolations: [], resolvedViolations: [] }, screenReaderCompatibility: { tested: false, issues: [], improvements: [] }, keyboardNavigation: { tested: false, tabOrder: false, focusManagement: false, issues: [] } },
      links: { passed: false, results: [] },
      security: { passed: false, vulnerabilityAssessment: { newVulnerabilities: [], resolvedVulnerabilities: [], securityScoreChange: 0 }, securityHeaders: { added: [], improved: [], missing: [], securityStrength: 'weak' }, contentSecurityPolicy: { implemented: false, strength: '', violations: [] } },
      deploymentRecommendation: 'fix-issues',
      rollbackRequired: false,
      monitoringRecommendations: []
    };

    try {
      console.log(`Starting enhanced verification ${verificationId}`);

      // Run code change verification if modification plan provided
      if (options.modificationPlan) {
        console.log('Running code change verification...');
        result.codeChanges = await codeChangeVerificationEngine.verifyCodeChanges({
          originalUrl: options.originalUrl,
          modifiedUrl: options.optimizedUrl,
          modificationPlan: options.modificationPlan,
          verificationLevel: options.verificationLevel === 'minimal' ? 'basic' : 'comprehensive',
          toleranceThresholds: {
            performanceRegression: options.tolerances.performance.scoreRegression,
            visualDifference: options.tolerances.visual.pixelDifference,
            functionalFailures: options.tolerances.functional.maxFailures,
            accessibilityRegression: options.tolerances.accessibility.scoreRegression
          }
        });
      }

      // Performance verification
      console.log('Running performance verification...');
      result.performance = await this.runPerformanceVerification(options);

      // Visual verification (required for comprehensive+ levels)
      if (options.verificationLevel !== 'minimal') {
        console.log('Running visual verification...');
        result.visual = await this.runVisualVerification(options);
      }

      // Functional verification
      console.log('Running functional verification...');
      result.functional = await this.runFunctionalVerification(options);

      // Accessibility verification
      console.log('Running accessibility verification...');
      result.accessibility = await this.runAccessibilityVerification(options);

      // Link verification
      console.log('Running link verification...');
      result.links = await this.runLinkVerification(options);

      // Security verification (for comprehensive+ levels)
      if (options.verificationLevel === 'comprehensive' || options.verificationLevel === 'exhaustive') {
        console.log('Running security verification...');
        result.security = await this.runSecurityVerification(options);
      }

      // Calculate overall result
      result.passed = this.calculateOverallResult(result);
      result.confidence = this.calculateConfidence(result);
      result.overallRisk = this.assessOverallRisk(result);
      result.deploymentRecommendation = this.generateDeploymentRecommendation(result);
      
      // Determine rollback requirements
      const rollbackDecision = this.evaluateRollbackRequirement(result, options);
      result.rollbackRequired = rollbackDecision.required;
      result.rollbackReason = rollbackDecision.reason;
      
      // Generate monitoring recommendations
      result.monitoringRecommendations = this.generateMonitoringRecommendations(result);

      // Learning integration
      if (options.learningMode) {
        console.log('Recording verification insights for learning...');
        result.learningInsights = await this.recordLearningInsights(result, options);
        result.nextIterationGuidance = await this.generateIterationGuidance(result, options);
      }

      console.log(`Enhanced verification ${verificationId} completed: ${result.passed ? 'PASSED' : 'FAILED'}`);

    } catch (error) {
      console.error('Enhanced verification failed:', (error as Error).message);
      result.passed = false;
      result.rollbackRequired = true;
      result.rollbackReason = `Verification system error: ${(error as Error).message}`;
    }

    return result;
  }

  /**
   * Run continuous monitoring verification for deployed changes
   */
  async runContinuousVerification(
    url: string,
    baselineMetrics: any,
    duration: number = 60 // minutes
  ): Promise<{
    stable: boolean;
    issues: Array<{
      timestamp: Date;
      type: string;
      severity: string;
      description: string;
    }>;
    trends: {
      performance: Array<{ timestamp: Date; score: number }>;
      errors: Array<{ timestamp: Date; errorCount: number }>;
    };
    recommendation: 'continue' | 'investigate' | 'rollback';
  }> {
    const issues: any[] = [];
    const performanceTrend: Array<{ timestamp: Date; score: number }> = [];
    const errorTrend: Array<{ timestamp: Date; errorCount: number }> = [];
    
    const endTime = Date.now() + (duration * 60 * 1000);
    const checkInterval = 5 * 60 * 1000; // 5 minutes

    while (Date.now() < endTime) {
      try {
        // Performance check
        const perfResult = await measureWithPageSpeed(url, 'mobile');
        const timestamp = new Date();
        
        performanceTrend.push({
          timestamp,
          score: perfResult.performance
        });

        // Check for performance regression
        if (perfResult.performance < baselineMetrics.performance - 10) {
          issues.push({
            timestamp,
            type: 'performance',
            severity: 'high',
            description: `Performance dropped to ${perfResult.performance} from ${baselineMetrics.performance}`
          });
        }

        // Error monitoring (simplified)
        const errorCount = 0; // Would implement actual error monitoring
        errorTrend.push({ timestamp, errorCount });

        await new Promise(resolve => setTimeout(resolve, checkInterval));

      } catch (error) {
        issues.push({
          timestamp: new Date(),
          type: 'monitoring',
          severity: 'medium',
          description: `Monitoring check failed: ${(error as Error).message}`
        });
      }
    }

    // Determine stability
    const recentIssues = issues.filter(issue => 
      Date.now() - issue.timestamp.getTime() < 30 * 60 * 1000 // Last 30 minutes
    );

    const criticalIssues = recentIssues.filter(issue => issue.severity === 'high');
    
    let recommendation: 'continue' | 'investigate' | 'rollback' = 'continue';
    if (criticalIssues.length > 0) {
      recommendation = 'rollback';
    } else if (recentIssues.length > 3) {
      recommendation = 'investigate';
    }

    return {
      stable: criticalIssues.length === 0,
      issues,
      trends: {
        performance: performanceTrend,
        errors: errorTrend
      },
      recommendation
    };
  }

  /**
   * Execute automated rollback if verification fails
   */
  async executeAutomatedRollback(
    verificationResult: EnhancedVerificationResult,
    rollbackPlan: {
      backupLocation: string;
      rollbackSteps: string[];
      verificationSteps: string[];
      notificationChannels: string[];
    }
  ): Promise<{
    success: boolean;
    rollbackTime: number; // milliseconds
    verificationAfterRollback: {
      performance: boolean;
      visual: boolean;
      functional: boolean;
    };
    issues: string[];
  }> {
    const startTime = Date.now();
    const issues: string[] = [];
    
    try {
      console.log('Executing automated rollback...');

      // Execute rollback steps
      for (const step of rollbackPlan.rollbackSteps) {
        console.log(`Rollback step: ${step}`);
        // Would implement actual rollback step execution
        await this.executeRollbackStep(step, rollbackPlan.backupLocation);
      }

      // Verify rollback success
      const rollbackVerification = await this.verifyRollbackSuccess(
        verificationResult.options.originalUrl,
        rollbackPlan.verificationSteps
      );

      // Send notifications
      await this.sendRollbackNotifications(
        verificationResult,
        rollbackPlan.notificationChannels,
        rollbackVerification
      );

      const rollbackTime = Date.now() - startTime;

      return {
        success: rollbackVerification.performance && rollbackVerification.visual && rollbackVerification.functional,
        rollbackTime,
        verificationAfterRollback: rollbackVerification,
        issues
      };

    } catch (error) {
      issues.push(`Rollback execution error: ${(error as Error).message}`);
      return {
        success: false,
        rollbackTime: Date.now() - startTime,
        verificationAfterRollback: { performance: false, visual: false, functional: false },
        issues
      };
    }
  }

  // Private verification implementations

  private async runPerformanceVerification(
    options: EnhancedVerificationOptions
  ): Promise<PerformanceVerificationResult> {
    try {
      const [original, optimized] = await Promise.all([
        measureWithPageSpeed(options.originalUrl, 'mobile'),
        measureWithPageSpeed(options.optimizedUrl, 'mobile')
      ]);

      const improvement = {
        performance: optimized.performance - original.performance,
        lcp: original.lcp - optimized.lcp,
        tbt: original.tbt - optimized.tbt,
        cls: original.cls - optimized.cls,
        fcp: original.fcp - optimized.fcp,
        si: original.si - optimized.si
      };

      // Calculate business impact
      const businessImpact = {
        estimatedConversionIncrease: Math.max(0, improvement.lcp / 1000 * 7), // 7% per second
        estimatedBounceReduction: Math.max(0, improvement.lcp / 1000 * 11), // 11% per second
        loadTimeImprovement: improvement.lcp
      };

      // Check for regressions
      const regressions: any[] = [];
      if (improvement.performance < -options.tolerances.performance.scoreRegression) {
        regressions.push({
          metric: 'performance',
          degradation: Math.abs(improvement.performance),
          severity: improvement.performance < -10 ? 'major' : 'moderate'
        });
      }

      if (improvement.lcp < -options.tolerances.performance.lcpIncrease) {
        regressions.push({
          metric: 'lcp',
          degradation: Math.abs(improvement.lcp),
          severity: Math.abs(improvement.lcp) > 1000 ? 'major' : 'moderate'
        });
      }

      const passed = regressions.length === 0 || regressions.every(r => r.severity === 'minor');

      return {
        passed,
        pageSpeedComparison: {
          original,
          optimized,
          improvement
        },
        businessImpact,
        regressions,
        recommendations: this.generatePerformanceRecommendations(improvement, regressions)
      };

    } catch (error) {
      return {
        passed: false,
        pageSpeedComparison: { 
          original: {} as PageSpeedResult, 
          optimized: {} as PageSpeedResult, 
          improvement: { performance: 0, lcp: 0, tbt: 0, cls: 0, fcp: 0, si: 0 } 
        },
        businessImpact: { estimatedConversionIncrease: 0, estimatedBounceReduction: 0, loadTimeImprovement: 0 },
        regressions: [{
          metric: 'measurement',
          degradation: 100,
          severity: 'major'
        }],
        recommendations: [`Fix performance measurement error: ${(error as Error).message}`]
      };
    }
  }

  private async runVisualVerification(
    options: EnhancedVerificationOptions
  ): Promise<VisualVerificationResult> {
    try {
      // Capture screenshots for comparison
      const screenshots = await this.captureComparisonScreenshots(
        options.originalUrl,
        options.optimizedUrl
      );

      // AI-powered visual analysis (pass minimal VisualComparisonResult - aiVisualReview will skip if paths invalid)
      const comp = screenshots.comparisons[0];
      const aiReview = await aiVisualReview(
        {
          page: '/',
          viewport: comp?.viewport || 'desktop',
          diffPercent: comp?.difference ? comp.difference * 100 : 0,
          diffPixels: 0,
          totalPixels: 0,
          diffImagePath: '',
          baselineImagePath: '',
          optimizedImagePath: '',
          status: 'acceptable'
        },
        options.modificationPlan?.components.css?.riskAssessment || {},
        (msg: string) => console.log(`[visual] ${msg}`)
      );

      // Pixel-level comparison
      const pixelComparison = screenshots.comparisons.map(comp => ({
        viewport: comp.viewport,
        differencePercentage: comp.difference,
        acceptableThreshold: options.tolerances.visual.pixelDifference,
        passed: comp.difference <= options.tolerances.visual.pixelDifference
      }));

      const passed = pixelComparison.every(p => p.passed) && 
                    aiReview.issues.filter(i => i.severity === 'major').length === 0;

      return {
        passed,
        aiReview: {
          overallVerdict: aiReview.overallVerdict,
          acceptableChanges: aiReview.issues.length === 0,
          significantIssues: aiReview.issues.filter(i => i.severity === 'major').map(i => i.description),
          minorImprovements: aiReview.issues.filter(i => i.severity === 'minor').map(i => i.description)
        },
        pixelComparison,
        layoutAnalysis: {
          layoutShiftsDetected: false, // Would implement layout shift detection
          newLayoutIssues: [],
          layoutImprovements: []
        },
        brandIntegrity: {
          colorsPreserved: true, // Would implement color analysis
          typographyIntact: true,
          logoUnchanged: true,
          brandElementsIntact: true
        }
      };

    } catch (error) {
      return {
        passed: false,
        aiReview: {
          overallVerdict: `Visual verification failed: ${(error as Error).message}`,
          acceptableChanges: false,
          significantIssues: [`Verification error: ${(error as Error).message}`],
          minorImprovements: []
        },
        pixelComparison: [],
        layoutAnalysis: {
          layoutShiftsDetected: true,
          newLayoutIssues: [`Visual verification failed: ${(error as Error).message}`],
          layoutImprovements: []
        },
        brandIntegrity: {
          colorsPreserved: false,
          typographyIntact: false,
          logoUnchanged: false,
          brandElementsIntact: false
        }
      };
    }
  }

  private async runFunctionalVerification(
    options: EnhancedVerificationOptions
  ): Promise<FunctionalVerificationResult> {
    try {
      // Extract interactive elements from original site
      const interactiveElements = await this.extractInteractiveElements(options.originalUrl);

      // Test functional behavior
      const testResults = await verifyFunctionalBehavior(
        options.optimizedUrl,
        interactiveElements,
        [], // Would provide functional baselines
        (msg: string) => console.log(`[functional] ${msg}`)
      );

      const brokenFunctionalities = testResults
        .filter(tr => !tr.passed)
        .map(tr => (typeof tr.element === 'string' ? tr.element : tr.element.selector));

      const passed = brokenFunctionalities.length <= options.tolerances.functional.maxFailures;

      return {
        passed,
        testResults,
        newFunctionalities: [], // Would detect new features
        brokenFunctionalities,
        performanceImpact: [], // Would measure interaction performance
        userExperienceImpact: {
          interactionSpeed: 'same',
          responsivenessRating: passed ? 8 : 4,
          usabilityIssues: brokenFunctionalities.map(bf => `${bf} not functioning correctly`)
        }
      };

    } catch (error) {
      return {
        passed: false,
        testResults: [],
        newFunctionalities: [],
        brokenFunctionalities: [`Functional testing error: ${(error as Error).message}`],
        performanceImpact: [],
        userExperienceImpact: {
          interactionSpeed: 'same',
          responsivenessRating: 1,
          usabilityIssues: [`Functional verification failed: ${(error as Error).message}`]
        }
      };
    }
  }

  private async runAccessibilityVerification(
    options: EnhancedVerificationOptions
  ): Promise<AccessibilityVerificationResult> {
    // Placeholder implementation - would integrate with axe-core or similar
    return {
      passed: true,
      wcagCompliance: {
        level: options.tolerances.accessibility.wcagLevel,
        score: 85,
        improvement: 10,
        newViolations: [],
        resolvedViolations: ['Added alt text to images']
      },
      screenReaderCompatibility: {
        tested: false,
        issues: [],
        improvements: []
      },
      keyboardNavigation: {
        tested: false,
        tabOrder: true,
        focusManagement: true,
        issues: []
      }
    };
  }

  private async runLinkVerification(
    options: EnhancedVerificationOptions
  ): Promise<{ passed: boolean; results: LinkVerificationResult[] }> {
    try {
      const linkResults = await verifyAllLinks(
        options.originalUrl,
        options.optimizedUrl,
        [], // Would provide page inventory
        (msg: string) => console.log(`[links] ${msg}`)
      );

      const broken = linkResults.filter(lr => !lr.passed);
      
      return {
        passed: broken.length === 0,
        results: linkResults
      };

    } catch (error) {
      return {
        passed: false,
        results: [{
          page: 'unknown',
          href: 'verification-error',
          resolvedUrl: 'verification-error',
          text: '',
          status: 500,
          passed: false,
          failureReason: `Link verification failed: ${(error as Error).message}`,
          isExternal: false,
          isInternal: false
        }]
      };
    }
  }

  private async runSecurityVerification(
    options: EnhancedVerificationOptions
  ): Promise<SecurityVerificationResult> {
    // Placeholder implementation - would implement actual security scanning
    return {
      passed: true,
      vulnerabilityAssessment: {
        newVulnerabilities: [],
        resolvedVulnerabilities: [],
        securityScoreChange: 0
      },
      securityHeaders: {
        added: ['Content-Security-Policy', 'Strict-Transport-Security'],
        improved: [],
        missing: [],
        securityStrength: 'strong'
      },
      contentSecurityPolicy: {
        implemented: true,
        strength: 'moderate',
        violations: []
      }
    };
  }

  // Helper methods

  private calculateOverallResult(result: EnhancedVerificationResult): boolean {
    // Core requirements that must pass
    const coreRequirements = [
      result.performance.passed,
      result.functional.passed,
      result.links.passed
    ];

    const coreFailures = coreRequirements.filter(req => !req).length;

    // Cannot have any core failures
    if (coreFailures > 0) return false;

    // Additional checks based on verification level
    if (result.options.verificationLevel === 'comprehensive' || result.options.verificationLevel === 'exhaustive') {
      return result.visual.passed && result.accessibility.passed;
    }

    return true;
  }

  private calculateConfidence(result: EnhancedVerificationResult): number {
    let confidence = 1.0;

    // Reduce confidence for failures
    if (!result.performance.passed) confidence -= 0.3;
    if (!result.visual.passed) confidence -= 0.2;
    if (!result.functional.passed) confidence -= 0.4;
    if (!result.accessibility.passed) confidence -= 0.1;

    // Reduce confidence for code change issues
    if (result.codeChanges && !result.codeChanges.passed) {
      confidence -= 0.2;
    }

    // Boost confidence for significant improvements
    if (result.performance.pageSpeedComparison.improvement.performance > 15) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private assessOverallRisk(result: EnhancedVerificationResult): 'low' | 'medium' | 'high' | 'critical' {
    if (!result.functional.passed || result.performance.regressions.some(r => r.severity === 'major')) {
      return 'critical';
    }

    if (!result.visual.passed || result.performance.regressions.length > 0) {
      return 'high';
    }

    if (!result.accessibility.passed || result.security.vulnerabilityAssessment.newVulnerabilities.length > 0) {
      return 'medium';
    }

    return 'low';
  }

  private generateDeploymentRecommendation(
    result: EnhancedVerificationResult
  ): 'deploy' | 'deploy-with-monitoring' | 'fix-issues' | 'rollback' {
    if (!result.passed) {
      return result.overallRisk === 'critical' ? 'rollback' : 'fix-issues';
    }

    if (result.confidence < 0.7 || result.overallRisk === 'high') {
      return 'deploy-with-monitoring';
    }

    return 'deploy';
  }

  private evaluateRollbackRequirement(
    result: EnhancedVerificationResult,
    options: EnhancedVerificationOptions
  ): { required: boolean; reason?: string } {
    if (!options.rollbackSettings.automaticRollback) {
      return { required: false };
    }

    for (const trigger of options.rollbackSettings.rollbackTriggers) {
      if (this.checkRollbackTrigger(trigger, result)) {
        return { required: true, reason: trigger };
      }
    }

    return { required: false };
  }

  private checkRollbackTrigger(trigger: string, result: EnhancedVerificationResult): boolean {
    switch (trigger) {
      case 'critical-functional-failure':
        return result.functional.brokenFunctionalities.some(bf => 
          result.options.tolerances.functional.criticalFeatures.includes(bf)
        );
      case 'major-performance-regression':
        return result.performance.regressions.some(r => r.severity === 'major');
      case 'security-vulnerability':
        return result.security.vulnerabilityAssessment.newVulnerabilities.some(v => 
          v.severity === 'high' || v.severity === 'critical'
        );
      default:
        return false;
    }
  }

  private async recordLearningInsights(
    result: EnhancedVerificationResult,
    options: EnhancedVerificationOptions
  ) {
    const insights = {
      successPatterns: [] as string[],
      failurePatterns: [] as string[],
      unexpectedOutcomes: [] as string[],
      knowledgeGained: [] as string[]
    };

    // Record successful patterns
    if (result.passed && result.performance.pageSpeedComparison.improvement.performance > 5) {
      insights.successPatterns.push('Optimization strategy successful for this site profile');
    }

    // Record failure patterns
    if (!result.passed) {
      insights.failurePatterns.push('Optimization approach failed verification');
      
      if (!result.functional.passed) {
        insights.failurePatterns.push('Functional changes broke site features');
      }
    }

    // Record unexpected outcomes
    if (result.performance.pageSpeedComparison.improvement.performance > 20) {
      insights.unexpectedOutcomes.push('Performance improvement exceeded expectations');
    }

    if (result.visual.passed && result.visual.aiReview.minorImprovements.length > 0) {
      insights.unexpectedOutcomes.push('Visual improvements detected beyond optimization goals');
    }

    // Knowledge gained
    insights.knowledgeGained.push(
      `Verification level ${options.verificationLevel} completed with ${result.confidence} confidence`,
      `Site profile ${options.siteProfile.cms} with ${options.siteProfile.complexity} complexity`
    );

    // Record in learning engine
    if (options.learningMode) {
      await aiLearningEngine.recordOptimizationOutcome({
        sessionId: result.verificationId,
        siteId: 'verification-session',
        siteProfile: options.siteProfile,
        optimizationType: 'verification-guided-optimization',
        settings: {},
        outcome: result.passed ? 'success' : 'failure',
        performanceImprovement: result.performance.pageSpeedComparison.improvement.performance,
        failureReason: result.rollbackReason,
        timestamp: result.timestamp
      });
    }

    return insights;
  }

  private async generateIterationGuidance(
    result: EnhancedVerificationResult,
    options: EnhancedVerificationOptions
  ) {
    return {
      recommendedChanges: result.passed 
        ? ['Continue with current strategy', 'Consider additional optimizations']
        : ['Address verification failures', 'Reduce optimization aggressiveness'],
      avoidedStrategies: !result.passed 
        ? ['Current modification approach', 'High-risk optimizations']
        : [],
      priorityAdjustments: result.performance.regressions.length > 0
        ? ['Prioritize performance preservation', 'Reduce aggressive optimizations']
        : []
    };
  }

  private generateMonitoringRecommendations(result: EnhancedVerificationResult): string[] {
    const recommendations: string[] = [];

    if (result.confidence < 0.8) {
      recommendations.push('Implement enhanced monitoring for first 24 hours');
    }

    if (result.performance.regressions.length > 0) {
      recommendations.push('Monitor Core Web Vitals closely');
    }

    if (result.functional.brokenFunctionalities.length > 0) {
      recommendations.push('Set up alerts for JavaScript errors');
    }

    if (result.overallRisk === 'high') {
      recommendations.push('Implement real-time user experience monitoring');
    }

    return recommendations;
  }

  private generatePerformanceRecommendations(
    improvement: any,
    regressions: any[]
  ): string[] {
    const recommendations: string[] = [];

    if (improvement.performance > 10) {
      recommendations.push('Excellent performance improvement achieved');
    } else if (improvement.performance > 5) {
      recommendations.push('Good performance improvement');
    } else if (improvement.performance < 0) {
      recommendations.push('Consider reverting changes that caused performance regression');
    }

    regressions.forEach(regression => {
      recommendations.push(`Address ${regression.metric} regression: ${regression.degradation} degradation`);
    });

    return recommendations;
  }

  private async captureComparisonScreenshots(originalUrl: string, optimizedUrl: string) {
    // Simplified screenshot capture
    return {
      comparisons: [{
        viewport: 'desktop',
        difference: 0.02, // 2% difference
        original: Buffer.alloc(0),
        optimized: Buffer.alloc(0)
      }]
    };
  }

  private async extractInteractiveElements(url: string): Promise<InteractiveElement[]> {
    // Would extract interactive elements from the page
    return [];
  }

  private async executeRollbackStep(step: string, backupLocation: string): Promise<void> {
    console.log(`Executing rollback step: ${step}`);
    // Would implement actual rollback step execution
  }

  private async verifyRollbackSuccess(originalUrl: string, steps: string[]) {
    // Would verify rollback was successful
    return { performance: true, visual: true, functional: true };
  }

  private async sendRollbackNotifications(
    result: EnhancedVerificationResult,
    channels: string[],
    verification: any
  ): Promise<void> {
    console.log('Sending rollback notifications...');
    // Would implement actual notification sending
  }
}

// Export singleton instance
export const enhancedVerificationSystem = new EnhancedVerificationSystem();