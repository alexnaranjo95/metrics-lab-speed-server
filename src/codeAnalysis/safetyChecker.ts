/**
 * Code Safety Checker
 * 
 * Comprehensive safety validation system that coordinates HTML, CSS, and JavaScript
 * analyzers to ensure modifications won't break website functionality or appearance.
 */

import { htmlAnalyzer, type HTMLAnalysisResult, type ModificationPlan as HTMLModificationPlan } from './htmlAnalyzer.js';
import { cssAnalyzer, type CSSAnalysisResult, type CSSModificationPlan } from './cssAnalyzer.js';
import { jsAnalyzer, type JSAnalysisResult, type JSModificationPlan } from './jsAnalyzer.js';
import type { SiteProfile } from '../ai/learningEngine.js';

export interface CodeAnalysisResult {
  html?: HTMLAnalysisResult;
  css?: CSSAnalysisResult;
  js?: JSAnalysisResult;
  overallSafety: {
    riskScore: number; // 0-100 (lower is safer)
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    primaryConcerns: string[];
    safeguards: string[];
  };
  interactions: {
    crossFileRisks: Array<{
      type: 'html-css' | 'html-js' | 'css-js';
      description: string;
      impact: string;
      mitigation: string;
    }>;
    dependencies: Array<{
      source: string;
      target: string;
      type: 'class' | 'id' | 'function' | 'variable';
      critical: boolean;
    }>;
  };
  recommendations: {
    safestApproach: string;
    alternativeStrategies: string[];
    requiredPrecautions: string[];
  };
}

export interface SafetyValidationResult {
  safe: boolean;
  confidence: number; // 0-1
  risks: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'functional' | 'visual' | 'performance' | 'security';
    description: string;
    likelihood: number; // 0-1
    impact: string;
    mitigation?: string;
  }>;
  requirements: {
    testing: string[];
    monitoring: string[];
    rollback: string[];
  };
  approvals: string[]; // Required approvals/reviews
}

export interface ComprehensiveModificationPlan {
  id: string;
  description: string;
  components: {
    html?: HTMLModificationPlan;
    css?: CSSModificationPlan;
    js?: JSModificationPlan;
  };
  combinedRisk: {
    overall: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    compoundingRisks: string[];
  };
  executionPlan: {
    phases: Array<{
      phase: number;
      name: string;
      description: string;
      modifications: string[];
      testingCheckpoints: string[];
      rollbackTriggers: string[];
      estimatedDuration: number; // minutes
    }>;
    totalDuration: number;
    criticalPath: string[];
  };
  safetyValidation: SafetyValidationResult;
}

export class CodeSafetyChecker {
  private validationCache = new Map<string, SafetyValidationResult>();

  /**
   * Analyze code safety across HTML, CSS, and JavaScript
   */
  async analyzeCodeSafety(
    files: {
      html?: string;
      css?: string;
      js?: string;
    },
    options?: {
      siteProfile?: SiteProfile;
      currentSettings?: Record<string, unknown>;
      usageData?: Record<string, boolean>;
    }
  ): Promise<CodeAnalysisResult> {
    const results: CodeAnalysisResult = {
      overallSafety: {
        riskScore: 0,
        riskLevel: 'low',
        primaryConcerns: [],
        safeguards: []
      },
      interactions: {
        crossFileRisks: [],
        dependencies: []
      },
      recommendations: {
        safestApproach: '',
        alternativeStrategies: [],
        requiredPrecautions: []
      }
    };

    // Analyze individual file types
    if (files.html) {
      results.html = await htmlAnalyzer.analyzeHTML(files.html);
    }

    if (files.css) {
      results.css = await cssAnalyzer.analyzeCSS(files.css, {
        htmlContent: files.html,
        usageData: options?.usageData
      });
    }

    if (files.js) {
      results.js = await jsAnalyzer.analyzeJS(files.js);
    }

    // Analyze cross-file interactions
    results.interactions = await this.analyzeCrossFileInteractions(files, results);

    // Calculate overall safety
    results.overallSafety = this.calculateOverallSafety(results);

    // Generate recommendations
    results.recommendations = this.generateSafetyRecommendations(results, options);

    return results;
  }

  /**
   * Validate safety of a proposed modification plan
   */
  async validateModificationSafety(
    plan: ComprehensiveModificationPlan,
    analysisResult: CodeAnalysisResult
  ): Promise<SafetyValidationResult> {
    const cacheKey = this.generateValidationCacheKey(plan, analysisResult);
    
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }

    const risks: SafetyValidationResult['risks'] = [];
    let safe = true;
    let confidence = 1.0;

    // Validate each component
    if (plan.components.html) {
      const htmlRisks = await this.validateHTMLModifications(plan.components.html, analysisResult.html);
      risks.push(...htmlRisks);
    }

    if (plan.components.css) {
      const cssRisks = await this.validateCSSModifications(plan.components.css, analysisResult.css);
      risks.push(...cssRisks);
    }

    if (plan.components.js) {
      const jsRisks = await this.validateJSModifications(plan.components.js, analysisResult.js);
      risks.push(...jsRisks);
    }

    // Validate cross-component interactions
    const interactionRisks = await this.validateCrossComponentRisks(plan, analysisResult);
    risks.push(...interactionRisks);

    // Assess overall safety
    const criticalRisks = risks.filter(r => r.severity === 'critical');
    const highRisks = risks.filter(r => r.severity === 'high');

    if (criticalRisks.length > 0) {
      safe = false;
      confidence = 0.1;
    } else if (highRisks.length > 2) {
      safe = false;
      confidence = 0.3;
    } else if (highRisks.length > 0) {
      confidence = Math.max(0.5, 1.0 - (highRisks.length * 0.2));
    }

    // Generate requirements
    const requirements = this.generateSafetyRequirements(risks, plan);

    // Determine required approvals
    const approvals = this.determineRequiredApprovals(risks, plan);

    const result: SafetyValidationResult = {
      safe,
      confidence,
      risks,
      requirements,
      approvals
    };

    this.validationCache.set(cacheKey, result);
    return result;
  }

  /**
   * Generate comprehensive modification plan with safety considerations
   */
  async generateSafeModificationPlan(
    optimizations: string[],
    files: { html?: string; css?: string; js?: string },
    options?: {
      aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
      siteProfile?: SiteProfile;
      prioritizeBy?: 'safety' | 'performance' | 'size';
    }
  ): Promise<ComprehensiveModificationPlan> {
    // Analyze current code
    const analysis = await this.analyzeCodeSafety(files, options);

    // Generate individual modification plans
    const components: ComprehensiveModificationPlan['components'] = {};

    if (files.html && optimizations.some(opt => opt.includes('html') || opt.includes('accessibility') || opt.includes('seo'))) {
      const htmlOptimizations = optimizations.filter(opt => 
        opt.includes('html') || opt.includes('accessibility') || opt.includes('seo') || opt.includes('alt') || opt.includes('meta')
      );
      if (htmlOptimizations.length > 0) {
        components.html = await htmlAnalyzer.generateModificationPlan(files.html, htmlOptimizations, options);
      }
    }

    if (files.css && optimizations.some(opt => opt.includes('css') || opt.includes('style'))) {
      const cssOptimizations = optimizations.filter(opt => 
        opt.includes('css') || opt.includes('style') || opt.includes('minify') || opt.includes('purge')
      );
      if (cssOptimizations.length > 0) {
        components.css = await cssAnalyzer.generateOptimizationPlan(files.css, cssOptimizations, {
          aggressiveness: options?.aggressiveness || 'moderate',
          htmlContent: files.html
        });
      }
    }

    if (files.js && optimizations.some(opt => opt.includes('js') || opt.includes('javascript') || opt.includes('jquery'))) {
      const jsOptimizations = optimizations.filter(opt => 
        opt.includes('js') || opt.includes('javascript') || opt.includes('jquery') || opt.includes('minify') || opt.includes('modernize')
      );
      if (jsOptimizations.length > 0) {
        components.js = await jsAnalyzer.generateOptimizationPlan(files.js, jsOptimizations, {
          aggressiveness: options?.aggressiveness || 'moderate'
        });
      }
    }

    // Assess combined risk
    const combinedRisk = this.assessCombinedRisk(components);

    // Create execution plan
    const executionPlan = this.createExecutionPlan(components, combinedRisk, options);

    // Generate plan
    const plan: ComprehensiveModificationPlan = {
      id: `plan_${Date.now()}`,
      description: `Safe optimization plan for: ${optimizations.join(', ')}`,
      components,
      combinedRisk,
      executionPlan,
      safetyValidation: { safe: false, confidence: 0, risks: [], requirements: { testing: [], monitoring: [], rollback: [] }, approvals: [] }
    };

    // Validate the plan
    plan.safetyValidation = await this.validateModificationSafety(plan, analysis);

    return plan;
  }

  // Private analysis methods

  private async analyzeCrossFileInteractions(
    files: { html?: string; css?: string; js?: string },
    results: Partial<CodeAnalysisResult>
  ): Promise<CodeAnalysisResult['interactions']> {
    const crossFileRisks: CodeAnalysisResult['interactions']['crossFileRisks'] = [];
    const dependencies: CodeAnalysisResult['interactions']['dependencies'] = [];

    // HTML-CSS interactions
    if (results.html && results.css) {
      // Check for CSS classes used in HTML that might be purged
      const htmlClasses = this.extractClassesFromHTML(files.html!);
      const cssSelectors = results.css.selectors.unique;

      htmlClasses.forEach(className => {
        const hasMatchingCSS = cssSelectors.some(selector => selector.includes(className));
        if (!hasMatchingCSS) {
          crossFileRisks.push({
            type: 'html-css',
            description: `HTML class "${className}" has no matching CSS`,
            impact: 'Styling may be missing',
            mitigation: 'Ensure CSS includes all necessary classes'
          });
        }
      });
    }

    // HTML-JS interactions
    if (results.html && results.js) {
      // Check for JavaScript dependencies on HTML elements
      const htmlIds = this.extractIdsFromHTML(files.html!);
      const jsGlobals = results.js.globals;

      // Check if JS references HTML IDs
      htmlIds.forEach(id => {
        if (jsGlobals.includes('document') && files.js!.includes(id)) {
          dependencies.push({
            source: 'js',
            target: `html#${id}`,
            type: 'id',
            critical: true
          });
        }
      });
    }

    // CSS-JS interactions
    if (results.css && results.js) {
      // Check for dynamic class manipulation
      const cssClasses = results.css.selectors.unique
        .filter(sel => sel.includes('.'))
        .map(sel => sel.split('.')[1]?.split(/[\s:>+~]/)[0])
        .filter(Boolean);

      cssClasses.forEach(className => {
        if (files.js!.includes(className)) {
          dependencies.push({
            source: 'js',
            target: `css.${className}`,
            type: 'class',
            critical: false
          });
        }
      });
    }

    return { crossFileRisks, dependencies };
  }

  private calculateOverallSafety(results: Partial<CodeAnalysisResult>): CodeAnalysisResult['overallSafety'] {
    let totalRiskScore = 0;
    let riskFactors = 0;
    const concerns: string[] = [];
    const safeguards: string[] = [];

    if (results.html) {
      totalRiskScore += results.html.safetyMetrics.modificationRiskScore;
      riskFactors++;
      
      if (results.html.safetyMetrics.criticalElementsCount > 5) {
        concerns.push('Many critical HTML elements detected');
      }
      
      if (results.html.safetyMetrics.complexInteractionsCount > 0) {
        concerns.push('Complex interactive elements present');
      }
    }

    if (results.css) {
      totalRiskScore += results.css.safetyMetrics.modificationRiskScore;
      riskFactors++;
      
      if (results.css.safetyMetrics.criticalRuleCount > 10) {
        concerns.push('Many critical CSS rules detected');
      }
    }

    if (results.js) {
      totalRiskScore += results.js.safetyMetrics.modificationRiskScore;
      riskFactors++;
      
      if (results.js.safetyMetrics.criticalFunctionCount > 3) {
        concerns.push('Critical JavaScript functions detected');
      }
      
      if (results.js.safetyMetrics.dynamicEvalCount > 0) {
        concerns.push('Dynamic code evaluation detected - high security risk');
      }
    }

    const avgRiskScore = riskFactors > 0 ? totalRiskScore / riskFactors : 0;
    
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (avgRiskScore > 75) riskLevel = 'critical';
    else if (avgRiskScore > 50) riskLevel = 'high';
    else if (avgRiskScore > 25) riskLevel = 'medium';

    // Add safeguards based on risk level
    if (riskLevel === 'critical') {
      safeguards.push('Extensive testing required');
      safeguards.push('Staged rollout mandatory');
      safeguards.push('Rollback plan must be prepared');
    } else if (riskLevel === 'high') {
      safeguards.push('Comprehensive testing recommended');
      safeguards.push('Visual regression testing required');
    } else if (riskLevel === 'medium') {
      safeguards.push('Basic functional testing required');
    }

    return {
      riskScore: Math.round(avgRiskScore),
      riskLevel,
      primaryConcerns: concerns,
      safeguards
    };
  }

  private generateSafetyRecommendations(
    results: Partial<CodeAnalysisResult>,
    options?: any
  ): CodeAnalysisResult['recommendations'] {
    const safestApproach = this.determineSafestApproach(results);
    const alternativeStrategies = this.generateAlternativeStrategies(results);
    const requiredPrecautions = this.generateRequiredPrecautions(results);

    return {
      safestApproach,
      alternativeStrategies,
      requiredPrecautions
    };
  }

  private determineSafestApproach(results: Partial<CodeAnalysisResult>): string {
    if (!results.html && !results.css && !results.js) {
      return 'No modifications detected - proceed with configuration-only changes';
    }

    const riskScore = (results.html?.safetyMetrics?.modificationRiskScore || 0) +
                     (results.css?.safetyMetrics?.modificationRiskScore || 0) +
                     (results.js?.safetyMetrics?.modificationRiskScore || 0);

    if (riskScore > 150) {
      return 'Use settings-only optimizations - avoid direct code modifications';
    } else if (riskScore > 100) {
      return 'Progressive implementation with extensive testing at each stage';
    } else if (riskScore > 50) {
      return 'Standard implementation with comprehensive testing';
    } else {
      return 'Standard implementation with basic validation';
    }
  }

  private generateAlternativeStrategies(results: Partial<CodeAnalysisResult>): string[] {
    const strategies: string[] = [];

    if ((results.css?.safetyMetrics?.criticalRuleCount || 0) > 10) {
      strategies.push('Use conservative CSS purging instead of aggressive');
      strategies.push('Implement CSS optimization in smaller batches');
    }

    if (results.js?.patterns.jquery.detected && results.js.patterns.jquery.riskLevel === 'high') {
      strategies.push('Keep jQuery and optimize other areas first');
      strategies.push('Replace jQuery gradually, one function at a time');
    }

    if ((results.html?.safetyMetrics?.complexInteractionsCount || 0) > 5) {
      strategies.push('Focus on non-interactive optimizations first');
      strategies.push('Use A/B testing for interactive element changes');
    }

    return strategies;
  }

  private generateRequiredPrecautions(results: Partial<CodeAnalysisResult>): string[] {
    const precautions: string[] = [];

    if ((results.html?.accessibility?.missingAltImages?.length || 0) > 0) {
      precautions.push('Validate generated alt text for accuracy and context');
    }

    if ((results.css?.selectors?.unused?.length || 0) > 10) {
      precautions.push('Test all page states and responsive breakpoints');
    }

    if ((results.js?.safetyMetrics?.eventListenerCount || 0) > 5) {
      precautions.push('Test all interactive functionality thoroughly');
    }

    precautions.push('Create comprehensive backup before modifications');
    precautions.push('Monitor for console errors after deployment');
    precautions.push('Have rollback plan ready and tested');

    return precautions;
  }

  // Validation methods

  private async validateHTMLModifications(
    plan: HTMLModificationPlan,
    analysis?: HTMLAnalysisResult
  ): Promise<SafetyValidationResult['risks']> {
    const risks: SafetyValidationResult['risks'] = [];

    plan.changes.forEach(change => {
      if (change.riskLevel === 'high') {
        risks.push({
          severity: 'high',
          category: 'functional',
          description: `High-risk HTML modification: ${change.reason}`,
          likelihood: 0.7,
          impact: 'May break page functionality or layout',
          mitigation: 'Extensive testing required'
        });
      }

      if (change.impact === 'accessibility' && analysis?.accessibility.missingAltImages.length > 10) {
        risks.push({
          severity: 'medium',
          category: 'functional',
          description: 'Many accessibility changes may need manual review',
          likelihood: 0.5,
          impact: 'Generated content may not be contextually appropriate',
          mitigation: 'Manual review of generated alt text and ARIA labels'
        });
      }
    });

    return risks;
  }

  private async validateCSSModifications(
    plan: CSSModificationPlan,
    analysis?: CSSAnalysisResult
  ): Promise<SafetyValidationResult['risks']> {
    const risks: SafetyValidationResult['risks'] = [];

    if (plan.riskAssessment.overall === 'high' || plan.riskAssessment.overall === 'critical') {
      risks.push({
        severity: plan.riskAssessment.overall === 'critical' ? 'critical' : 'high',
        category: 'visual',
        description: 'CSS modifications have high risk of visual regressions',
        likelihood: 0.8,
        impact: 'Site appearance may be significantly altered',
        mitigation: 'Visual regression testing across all breakpoints required'
      });
    }

    if (plan.expectedSavings.selectorReduction > 20) {
      risks.push({
        severity: 'medium',
        category: 'visual',
        description: 'Large number of CSS selectors being removed',
        likelihood: 0.6,
        impact: 'Some styling may be lost',
        mitigation: 'Test all page states and interactive elements'
      });
    }

    return risks;
  }

  private async validateJSModifications(
    plan: JSModificationPlan,
    analysis?: JSAnalysisResult
  ): Promise<SafetyValidationResult['risks']> {
    const risks: SafetyValidationResult['risks'] = [];

    plan.changes.forEach(change => {
      if (change.target.pattern === 'jquery' && change.type === 'replace') {
        risks.push({
          severity: 'high',
          category: 'functional',
          description: 'jQuery removal may break interactive functionality',
          likelihood: 0.7,
          impact: 'Forms, animations, and dynamic content may fail',
          mitigation: 'Comprehensive testing of all interactive elements required'
        });
      }

      if (change.riskLevel === 'critical') {
        risks.push({
          severity: 'critical',
          category: 'functional',
          description: `Critical JavaScript modification: ${change.reason}`,
          likelihood: 0.9,
          impact: 'Site functionality may be completely broken',
          mitigation: 'Expert review and extensive testing required'
        });
      }
    });

    if (plan.compatibilityImpact.breakingChanges.length > 0) {
      risks.push({
        severity: 'medium',
        category: 'functional',
        description: 'Browser compatibility issues detected',
        likelihood: 0.5,
        impact: 'Site may not work in older browsers',
        mitigation: 'Test across all target browsers and provide polyfills'
      });
    }

    return risks;
  }

  private async validateCrossComponentRisks(
    plan: ComprehensiveModificationPlan,
    analysis: CodeAnalysisResult
  ): Promise<SafetyValidationResult['risks']> {
    const risks: SafetyValidationResult['risks'] = [];

    // Check for compounding risks
    if (plan.components.css && plan.components.js) {
      risks.push({
        severity: 'medium',
        category: 'functional',
        description: 'CSS and JavaScript changes together increase risk',
        likelihood: 0.4,
        impact: 'Combined changes may have unexpected interactions',
        mitigation: 'Test CSS and JS changes separately, then together'
      });
    }

    // Check dependency risks
    analysis.interactions.dependencies.forEach(dep => {
      if (dep.critical && this.planAffectsDependency(plan, dep)) {
        risks.push({
          severity: 'high',
          category: 'functional',
          description: `Critical dependency may be affected: ${dep.source} → ${dep.target}`,
          likelihood: 0.8,
          impact: 'Dependent functionality may break',
          mitigation: 'Preserve critical dependencies or update references'
        });
      }
    });

    return risks;
  }

  private generateSafetyRequirements(
    risks: SafetyValidationResult['risks'],
    plan: ComprehensiveModificationPlan
  ): SafetyValidationResult['requirements'] {
    const testing: string[] = ['Basic functionality testing'];
    const monitoring: string[] = ['Monitor for console errors'];
    const rollback: string[] = ['Prepare rollback procedure'];

    const highRisks = risks.filter(r => r.severity === 'high' || r.severity === 'critical');
    
    if (highRisks.length > 0) {
      testing.push('Comprehensive regression testing');
      testing.push('Multi-browser compatibility testing');
      monitoring.push('Real-time error monitoring');
      monitoring.push('Performance monitoring');
      rollback.push('Automated rollback triggers');
    }

    if (risks.some(r => r.category === 'visual')) {
      testing.push('Visual regression testing');
      testing.push('Responsive design testing');
    }

    if (risks.some(r => r.category === 'functional')) {
      testing.push('Interactive element testing');
      testing.push('Form submission testing');
    }

    return { testing, monitoring, rollback };
  }

  private determineRequiredApprovals(
    risks: SafetyValidationResult['risks'],
    plan: ComprehensiveModificationPlan
  ): string[] {
    const approvals: string[] = [];

    if (risks.some(r => r.severity === 'critical')) {
      approvals.push('Technical lead approval required');
      approvals.push('QA team sign-off required');
    }

    if (risks.some(r => r.severity === 'high')) {
      approvals.push('Senior developer review required');
    }

    if (risks.some(r => r.category === 'security')) {
      approvals.push('Security team review required');
    }

    return approvals;
  }

  // Execution planning methods

  private assessCombinedRisk(
    components: ComprehensiveModificationPlan['components']
  ): ComprehensiveModificationPlan['combinedRisk'] {
    const factors: string[] = [];
    const compoundingRisks: string[] = [];
    let overall: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Assess individual component risks
    if (components.html && components.html.riskAssessment.overall !== 'low') {
      factors.push(`HTML changes: ${components.html.riskAssessment.overall} risk`);
    }

    if (components.css && components.css.riskAssessment.overall !== 'low') {
      factors.push(`CSS changes: ${components.css.riskAssessment.overall} risk`);
    }

    if (components.js && components.js.riskAssessment.overall !== 'low') {
      factors.push(`JavaScript changes: ${components.js.riskAssessment.overall} risk`);
    }

    // Check for compounding risks
    if (components.css && components.js) {
      compoundingRisks.push('CSS and JavaScript changes may interact unexpectedly');
    }

    if (components.html && (components.css || components.js)) {
      compoundingRisks.push('HTML structure changes may affect CSS/JS targeting');
    }

    // Determine overall risk
    const componentRisks = [
      components.html?.riskAssessment.overall,
      components.css?.riskAssessment.overall,
      components.js?.riskAssessment.overall
    ].filter(Boolean);

    if (componentRisks.includes('critical')) {
      overall = 'critical';
    } else if (componentRisks.includes('high') && componentRisks.length > 1) {
      overall = 'critical'; // Multiple high-risk changes
    } else if (componentRisks.includes('high')) {
      overall = 'high';
    } else if (componentRisks.length > 2 || componentRisks.includes('medium')) {
      overall = 'medium';
    }

    return { overall, factors, compoundingRisks };
  }

  private createExecutionPlan(
    components: ComprehensiveModificationPlan['components'],
    combinedRisk: ComprehensiveModificationPlan['combinedRisk'],
    options?: any
  ): ComprehensiveModificationPlan['executionPlan'] {
    const phases: ComprehensiveModificationPlan['executionPlan']['phases'] = [];
    let totalDuration = 0;

    // Phase 1: Preparation and backup
    phases.push({
      phase: 1,
      name: 'Preparation and Backup',
      description: 'Create backups and prepare rollback procedures',
      modifications: ['Create full site backup', 'Document current state', 'Prepare rollback scripts'],
      testingCheckpoints: ['Verify backup integrity', 'Test rollback procedure'],
      rollbackTriggers: ['Backup failure'],
      estimatedDuration: 15
    });
    totalDuration += 15;

    // Phase 2: Low-risk modifications first
    const lowRiskMods: string[] = [];
    if (components.html) {
      lowRiskMods.push(...components.html.changes.filter(c => c.riskLevel === 'low').map(c => c.reason));
    }
    if (components.css) {
      lowRiskMods.push(...components.css.changes.filter(c => c.riskLevel === 'low').map(c => c.reason));
    }

    if (lowRiskMods.length > 0) {
      phases.push({
        phase: 2,
        name: 'Low-Risk Modifications',
        description: 'Apply safe, low-risk changes first',
        modifications: lowRiskMods,
        testingCheckpoints: ['Basic functionality test', 'Visual spot check'],
        rollbackTriggers: ['Any functional regression'],
        estimatedDuration: 20
      });
      totalDuration += 20;
    }

    // Phase 3: Medium-risk modifications
    const mediumRiskMods: string[] = [];
    if (components.css) {
      mediumRiskMods.push(...components.css.changes.filter(c => c.riskLevel === 'medium').map(c => c.reason));
    }
    if (components.js) {
      mediumRiskMods.push(...components.js.changes.filter(c => c.riskLevel === 'medium').map(c => c.reason));
    }

    if (mediumRiskMods.length > 0) {
      phases.push({
        phase: 3,
        name: 'Medium-Risk Modifications',
        description: 'Apply moderate-risk changes with comprehensive testing',
        modifications: mediumRiskMods,
        testingCheckpoints: ['Full functional testing', 'Cross-browser testing', 'Performance testing'],
        rollbackTriggers: ['Performance regression > 5%', 'Functional failures', 'Visual regressions'],
        estimatedDuration: 45
      });
      totalDuration += 45;
    }

    // Phase 4: High-risk modifications (if any)
    const highRiskMods: string[] = [];
    if (components.js) {
      highRiskMods.push(...components.js.changes.filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').map(c => c.reason));
    }

    if (highRiskMods.length > 0) {
      phases.push({
        phase: 4,
        name: 'High-Risk Modifications',
        description: 'Apply high-risk changes with extensive monitoring',
        modifications: highRiskMods,
        testingCheckpoints: [
          'Comprehensive regression testing',
          'Load testing',
          'Security testing',
          'Accessibility testing'
        ],
        rollbackTriggers: ['Any critical functionality failure', 'Security vulnerabilities', 'Performance regression > 2%'],
        estimatedDuration: 90
      });
      totalDuration += 90;
    }

    // Determine critical path
    const criticalPath = phases.map(p => p.name);

    return {
      phases,
      totalDuration,
      criticalPath
    };
  }

  // Helper methods

  private extractClassesFromHTML(html: string): string[] {
    const classRegex = /class\s*=\s*["']([^"']*)["']/g;
    const classes: string[] = [];
    let match;
    
    while ((match = classRegex.exec(html)) !== null) {
      const classList = match[1].split(/\s+/).filter(Boolean);
      classes.push(...classList);
    }
    
    return [...new Set(classes)];
  }

  private extractIdsFromHTML(html: string): string[] {
    const idRegex = /id\s*=\s*["']([^"']*)["']/g;
    const ids: string[] = [];
    let match;
    
    while ((match = idRegex.exec(html)) !== null) {
      ids.push(match[1]);
    }
    
    return [...new Set(ids)];
  }

  private planAffectsDependency(
    plan: ComprehensiveModificationPlan,
    dependency: CodeAnalysisResult['interactions']['dependencies'][0]
  ): boolean {
    // Check if any modifications in the plan would affect this dependency
    if (dependency.type === 'class' && plan.components.css) {
      return plan.components.css.changes.some(change => 
        change.target.selector?.includes(dependency.target.split('.')[1])
      );
    }

    if (dependency.type === 'function' && plan.components.js) {
      return plan.components.js.changes.some(change => 
        change.target.function === dependency.target
      );
    }

    return false;
  }

  private generateValidationCacheKey(
    plan: ComprehensiveModificationPlan,
    analysis: CodeAnalysisResult
  ): string {
    const planHash = JSON.stringify({
      components: Object.keys(plan.components),
      risk: plan.combinedRisk.overall
    });
    
    const analysisHash = JSON.stringify({
      htmlRisk: analysis.html?.safetyMetrics.modificationRiskScore,
      cssRisk: analysis.css?.safetyMetrics.modificationRiskScore,
      jsRisk: analysis.js?.safetyMetrics.modificationRiskScore
    });
    
    return `${planHash}-${analysisHash}`;
  }
}

// Export singleton instance
export const codeSafetyChecker = new CodeSafetyChecker();