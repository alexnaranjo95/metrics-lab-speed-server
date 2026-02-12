/**
 * PageSpeed Audit Diagnostics System
 * 
 * Deep diagnostic system for analyzing PageSpeed audit failures and providing
 * intelligent, AI-driven solutions with detailed implementation guidance.
 */

import { getAdvancedAuditMapping, type AdvancedAuditMapping } from './advancedAudits.js';
import { aiKnowledgeBase } from '../../ai/knowledgeBase.js';
import type { SiteProfile } from '../../ai/learningEngine.js';
import type { OptimizationWorkflow } from './types.js';

export interface DiagnosticResult {
  auditId: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  impact: 'high' | 'medium' | 'low';
  category: 'performance' | 'accessibility' | 'seo' | 'best-practices' | 'pwa';
  
  // Problem analysis
  problemDescription: string;
  rootCauses: string[];
  affectedElements: Array<{
    selector?: string;
    element?: string;
    issue: string;
    location?: string;
  }>;
  
  // Solution recommendations
  primarySolution: {
    strategy: string;
    description: string;
    aiActions: string[];
    settings: Record<string, unknown>;
    codeChanges?: Array<{
      file: string;
      change: string;
      before?: string;
      after?: string;
    }>;
    estimatedImpact: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    implementation: {
      steps: string[];
      estimatedTime: number;
      prerequisites: string[];
      verificationSteps: string[];
    };
  };
  
  alternativeSolutions: Array<{
    strategy: string;
    description: string;
    pros: string[];
    cons: string[];
    suitability: number; // 0-1 score for this site profile
  }>;
  
  // Learning insights
  historicalData?: {
    successRate: number;
    averageImprovement: number;
    sampleSize: number;
    commonPitfalls: string[];
  };
  
  // Prevention recommendations
  preventionTips: string[];
  monitoringRecommendations: string[];
}

export interface DiagnosticContext {
  siteProfile: SiteProfile;
  pageSpeedData: OptimizationWorkflow;
  currentSettings: Record<string, unknown>;
  failedAudits: string[];
  siteUrl: string;
  strategy: 'mobile' | 'desktop';
}

export class AuditDiagnosticsEngine {
  /**
   * Perform comprehensive diagnostic analysis for all failed audits
   */
  async diagnoseAllFailures(context: DiagnosticContext): Promise<DiagnosticResult[]> {
    const diagnostics: DiagnosticResult[] = [];
    
    // Group related audits for better analysis
    const auditGroups = this.groupRelatedAudits(context.failedAudits);
    
    for (const group of auditGroups) {
      const groupDiagnostics = await this.diagnoseAuditGroup(group, context);
      diagnostics.push(...groupDiagnostics);
    }
    
    // Sort by severity and impact
    return diagnostics.sort((a, b) => {
      const severityWeight = { critical: 4, major: 3, minor: 2, info: 1 };
      const impactWeight = { high: 3, medium: 2, low: 1 };
      
      const aScore = severityWeight[a.severity] * impactWeight[a.impact];
      const bScore = severityWeight[b.severity] * impactWeight[b.impact];
      
      return bScore - aScore;
    });
  }

  /**
   * Diagnose a specific audit failure with detailed analysis
   */
  async diagnoseSingleAudit(
    auditId: string, 
    auditData: any,
    context: DiagnosticContext
  ): Promise<DiagnosticResult> {
    const auditMapping = getAdvancedAuditMapping(auditId);
    
    if (!auditMapping) {
      return this.createGenericDiagnostic(auditId, auditData, context);
    }

    // Get historical data from knowledge base
    const historicalData = await this.getHistoricalData(auditId, context.siteProfile);
    
    // Analyze specific audit failure
    const problemAnalysis = await this.analyzeAuditProblem(auditId, auditData, auditMapping, context);
    
    // Generate solution recommendations
    const solutions = await this.generateSolutionRecommendations(auditMapping, problemAnalysis, context);
    
    // Get alternative approaches
    const alternatives = await this.getAlternativeSolutions(auditId, context.siteProfile);

    return {
      auditId,
      severity: this.determineSeverity(auditMapping, auditData, context),
      impact: auditMapping.impact,
      category: auditMapping.category,
      problemDescription: problemAnalysis.description,
      rootCauses: problemAnalysis.rootCauses,
      affectedElements: problemAnalysis.affectedElements,
      primarySolution: solutions.primary,
      alternativeSolutions: alternatives,
      historicalData,
      preventionTips: this.generatePreventionTips(auditMapping, problemAnalysis),
      monitoringRecommendations: this.generateMonitoringRecommendations(auditMapping)
    };
  }

  /**
   * Generate step-by-step implementation plan for audit fix
   */
  async generateImplementationPlan(
    auditId: string,
    siteProfile: SiteProfile,
    selectedSolution?: string
  ): Promise<{
    phases: Array<{
      phase: number;
      name: string;
      description: string;
      steps: Array<{
        step: number;
        action: string;
        details: string;
        estimatedTime: number;
        riskLevel: string;
        verificationStep: string;
        rollbackPlan?: string;
      }>;
      estimatedTime: number;
      prerequisites: string[];
      deliverables: string[];
    }>;
    totalEstimatedTime: number;
    riskAssessment: {
      overallRisk: string;
      riskFactors: string[];
      mitigationStrategies: string[];
    };
    successCriteria: string[];
    rollbackStrategy: string;
  }> {
    const auditMapping = getAdvancedAuditMapping(auditId);
    if (!auditMapping) {
      throw new Error(`Unknown audit ID: ${auditId}`);
    }

    // Generate detailed implementation phases
    const phases = await this.generateImplementationPhases(auditMapping, siteProfile, selectedSolution);
    
    // Calculate total time and risk
    const totalEstimatedTime = phases.reduce((total, phase) => total + phase.estimatedTime, 0);
    const riskAssessment = this.assessImplementationRisk(auditMapping, siteProfile, phases);
    
    // Define success criteria
    const successCriteria = this.generateSuccessCriteria(auditMapping);
    
    // Create rollback strategy
    const rollbackStrategy = this.createRollbackStrategy(auditMapping, phases);

    return {
      phases,
      totalEstimatedTime,
      riskAssessment,
      successCriteria,
      rollbackStrategy
    };
  }

  // Private helper methods

  private groupRelatedAudits(auditIds: string[]): string[][] {
    const groups: string[][] = [];
    const processed = new Set<string>();

    // Define audit relationships
    const relatedAudits = {
      'largest-contentful-paint': ['render-blocking-resources', 'uses-optimized-images', 'server-response-time'],
      'total-blocking-time': ['unused-javascript', 'render-blocking-resources', 'third-party-summary'],
      'cumulative-layout-shift': ['uses-optimized-images', 'font-display', 'layout-shift-elements'],
      'unused-css-rules': ['render-blocking-resources', 'minify-css'],
      'unused-javascript': ['render-blocking-resources', 'minify-javascript'],
      'image-alt': ['image-aspect-ratio', 'image-size-responsive'],
      'color-contrast': ['link-name', 'button-name'],
      'document-title': ['meta-description', 'structured-data']
    };

    for (const auditId of auditIds) {
      if (processed.has(auditId)) continue;

      const group = [auditId];
      processed.add(auditId);

      // Find related audits in the failure list
      const related = relatedAudits[auditId as keyof typeof relatedAudits] || [];
      for (const relatedId of related) {
        if (auditIds.includes(relatedId) && !processed.has(relatedId)) {
          group.push(relatedId);
          processed.add(relatedId);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private async diagnoseAuditGroup(auditIds: string[], context: DiagnosticContext): Promise<DiagnosticResult[]> {
    const diagnostics: DiagnosticResult[] = [];

    for (const auditId of auditIds) {
      const auditData = this.getAuditData(auditId, context.pageSpeedData);
      if (auditData) {
        const diagnostic = await this.diagnoseSingleAudit(auditId, auditData, context);
        diagnostics.push(diagnostic);
      }
    }

    return diagnostics;
  }

  private getAuditData(auditId: string, pageSpeedData: OptimizationWorkflow): any {
    // Extract audit data from PageSpeed results
    return pageSpeedData.opportunities?.find(opp => opp.id === auditId) ||
           pageSpeedData.accessibilityIssues?.find(issue => issue.id === auditId) ||
           pageSpeedData.seoIssues?.find(issue => issue.id === auditId) ||
           pageSpeedData.bestPracticesIssues?.find(issue => issue.id === auditId);
  }

  private async getHistoricalData(auditId: string, siteProfile: SiteProfile) {
    const solutions = await aiKnowledgeBase.getAuditSolutions([auditId]);
    
    if (solutions.length > 0) {
      const solution = solutions[0].solutions[0];
      return {
        successRate: solution?.successRate || 0,
        averageImprovement: solution?.estimatedImprovement || 0,
        sampleSize: 0, // Would come from actual data
        commonPitfalls: solutions[0].commonPitfalls
      };
    }
    
    return undefined;
  }

  private async analyzeAuditProblem(
    auditId: string,
    auditData: any,
    auditMapping: AdvancedAuditMapping,
    context: DiagnosticContext
  ) {
    const analysis = {
      description: auditMapping.description,
      rootCauses: [...auditMapping.commonCauses],
      affectedElements: [] as Array<{ selector?: string; element?: string; issue: string; location?: string }>
    };

    // Specific analysis based on audit type
    switch (auditId) {
      case 'largest-contentful-paint':
        analysis.rootCauses = await this.analyzeLCPIssues(auditData, context);
        analysis.affectedElements = await this.identifyLCPElements(auditData);
        break;
        
      case 'total-blocking-time':
        analysis.rootCauses = await this.analyzeTBTIssues(auditData, context);
        analysis.affectedElements = await this.identifyBlockingScripts(auditData);
        break;
        
      case 'cumulative-layout-shift':
        analysis.rootCauses = await this.analyzeCLSIssues(auditData, context);
        analysis.affectedElements = await this.identifyShiftingElements(auditData);
        break;
        
      case 'image-alt':
        analysis.affectedElements = await this.identifyImagesWithoutAlt(auditData);
        break;
        
      case 'color-contrast':
        analysis.affectedElements = await this.identifyLowContrastElements(auditData);
        break;
        
      default:
        // Generic analysis using audit data
        if (auditData.details?.items) {
          analysis.affectedElements = auditData.details.items.map((item: any) => ({
            element: item.node?.snippet || item.source || 'Unknown',
            issue: item.reason || auditMapping.description,
            location: item.source
          }));
        }
    }

    return analysis;
  }

  private async generateSolutionRecommendations(
    auditMapping: AdvancedAuditMapping,
    problemAnalysis: any,
    context: DiagnosticContext
  ) {
    // Get AI-driven recommendations
    const recommendations = await aiKnowledgeBase.getOptimizationRecommendations(
      context.siteProfile,
      [auditMapping.id]
    );

    const primaryRec = recommendations[0];
    
    return {
      primary: {
        strategy: primaryRec?.strategy || auditMapping.id,
        description: auditMapping.description,
        aiActions: auditMapping.aiActions,
        settings: primaryRec?.settings || {},
        codeChanges: this.generateCodeChanges(auditMapping, problemAnalysis),
        estimatedImpact: primaryRec?.expectedImprovement || 0,
        riskLevel: auditMapping.riskLevel,
        implementation: {
          steps: this.generateImplementationSteps(auditMapping),
          estimatedTime: auditMapping.estimatedTime,
          prerequisites: auditMapping.prerequisites,
          verificationSteps: auditMapping.verificationSteps
        }
      }
    };
  }

  private async getAlternativeSolutions(auditId: string, siteProfile: SiteProfile) {
    const solutions = await aiKnowledgeBase.getAuditSolutions([auditId]);
    
    if (solutions.length > 0 && solutions[0].solutions.length > 1) {
      return solutions[0].solutions.slice(1, 4).map(solution => ({
        strategy: solution.type,
        description: solution.description,
        pros: [`Success rate: ${Math.round(solution.successRate * 100)}%`],
        cons: [`Risk level: ${solution.riskLevel}`],
        suitability: solution.confidence
      }));
    }
    
    return [];
  }

  private generateCodeChanges(auditMapping: AdvancedAuditMapping, problemAnalysis: any) {
    const changes: Array<{ file: string; change: string; before?: string; after?: string }> = [];
    
    // Generate specific code changes based on audit type
    switch (auditMapping.id) {
      case 'image-alt':
        problemAnalysis.affectedElements.forEach((element: any) => {
          changes.push({
            file: 'HTML templates',
            change: 'Add alt attribute to image',
            before: element.element,
            after: element.element.replace('<img', '<img alt="Generated description"')
          });
        });
        break;
        
      case 'largest-contentful-paint':
        changes.push({
          file: 'HTML head',
          change: 'Add preload for LCP resource',
          after: '<link rel="preload" as="image" href="hero-image.webp">'
        });
        break;
        
      case 'render-blocking-resources':
        changes.push({
          file: 'HTML head',
          change: 'Defer non-critical CSS',
          before: '<link rel="stylesheet" href="styles.css">',
          after: '<link rel="preload" href="styles.css" as="style" onload="this.onload=null;this.rel=\'stylesheet\'">'
        });
        break;
    }
    
    return changes;
  }

  private generateImplementationSteps(auditMapping: AdvancedAuditMapping): string[] {
    const baseSteps = [
      'Analyze current implementation',
      'Backup existing code',
      'Apply optimization changes',
      'Test functionality',
      'Verify performance improvement',
      'Monitor for issues'
    ];

    // Add audit-specific steps
    const specificSteps: Record<string, string[]> = {
      'largest-contentful-paint': [
        'Identify LCP element using browser dev tools',
        'Optimize LCP resource (compress, convert format)',
        'Add preload link for LCP resource',
        'Set fetchpriority="high" on LCP element',
        'Test LCP timing across devices'
      ],
      'image-alt': [
        'Inventory all images on the site',
        'Generate contextual alt text for each image',
        'Identify purely decorative images',
        'Add alt="" to decorative images',
        'Add descriptive alt text to content images',
        'Test with screen reader'
      ],
      'color-contrast': [
        'Audit all text elements for contrast',
        'Calculate contrast ratios',
        'Identify failing combinations',
        'Adjust colors while maintaining brand identity',
        'Test with color blindness simulators'
      ]
    };

    return specificSteps[auditMapping.id] || baseSteps;
  }

  private determineSeverity(
    auditMapping: AdvancedAuditMapping,
    auditData: any,
    context: DiagnosticContext
  ): 'critical' | 'major' | 'minor' | 'info' {
    // Determine severity based on impact and current score
    if (auditMapping.impact === 'high' && auditMapping.category === 'performance') {
      return 'critical';
    }
    
    if (auditMapping.impact === 'high') {
      return 'major';
    }
    
    if (auditMapping.impact === 'medium') {
      return 'minor';
    }
    
    return 'info';
  }

  private generatePreventionTips(auditMapping: AdvancedAuditMapping, problemAnalysis: any): string[] {
    const tips: string[] = [
      `Regularly monitor ${auditMapping.title} in performance testing`,
      `Include ${auditMapping.category} checks in development workflow`
    ];

    // Add specific prevention tips based on audit
    const specificTips: Record<string, string[]> = {
      'largest-contentful-paint': [
        'Always optimize images before adding to site',
        'Use performance budgets to catch large assets',
        'Implement automated image optimization in build process'
      ],
      'image-alt': [
        'Make alt text mandatory in content management system',
        'Train content creators on alt text best practices',
        'Use automated checks in deployment pipeline'
      ],
      'color-contrast': [
        'Use design systems with accessible color palettes',
        'Include contrast checking in design review process',
        'Test with accessibility tools during development'
      ]
    };

    return [...tips, ...(specificTips[auditMapping.id] || [])];
  }

  private generateMonitoringRecommendations(auditMapping: AdvancedAuditMapping): string[] {
    return [
      `Set up automated monitoring for ${auditMapping.title}`,
      `Include in regular performance/accessibility audits`,
      `Monitor for regressions after content updates`,
      `Track improvement trends over time`
    ];
  }

  // Audit-specific analysis methods
  private async analyzeLCPIssues(auditData: any, context: DiagnosticContext): Promise<string[]> {
    const causes: string[] = [];
    
    if (auditData.numericValue > 4000) {
      causes.push('LCP time exceeds 4 seconds - critical performance issue');
    }
    
    // Would analyze specific LCP elements and their optimization potential
    causes.push('Large unoptimized images likely affecting LCP');
    causes.push('Server response time may be slow');
    
    return causes;
  }

  private async identifyLCPElements(auditData: any) {
    // Would identify specific LCP elements from audit data
    return [{
      selector: auditData.details?.items?.[0]?.node?.selector,
      element: auditData.details?.items?.[0]?.node?.snippet || 'LCP element',
      issue: 'Largest Contentful Paint element needs optimization',
      location: 'Above the fold'
    }];
  }

  private async analyzeTBTIssues(auditData: any, context: DiagnosticContext): Promise<string[]> {
    const causes: string[] = [];
    
    if (auditData.numericValue > 600) {
      causes.push('Total Blocking Time exceeds 600ms - major interaction delay');
    }
    
    causes.push('Large JavaScript bundles blocking main thread');
    causes.push('Synchronous script execution during page load');
    
    return causes;
  }

  private async identifyBlockingScripts(auditData: any) {
    // Would identify specific blocking scripts
    return auditData.details?.items?.map((item: any) => ({
      element: item.url || 'Unknown script',
      issue: `Blocking main thread for ${Math.round(item.total || 0)}ms`,
      location: item.url
    })) || [];
  }

  private async analyzeCLSIssues(auditData: any, context: DiagnosticContext): Promise<string[]> {
    const causes: string[] = [];
    
    if (auditData.numericValue > 0.25) {
      causes.push('Cumulative Layout Shift exceeds 0.25 - poor visual stability');
    }
    
    causes.push('Images without explicit dimensions causing layout shifts');
    causes.push('Web fonts loading without proper fallback strategy');
    
    return causes;
  }

  private async identifyShiftingElements(auditData: any) {
    // Would identify elements causing layout shifts
    return auditData.details?.items?.map((item: any) => ({
      element: item.node?.snippet || 'Shifting element',
      issue: `Causes ${item.score} CLS contribution`,
      selector: item.node?.selector
    })) || [];
  }

  private async identifyImagesWithoutAlt(auditData: any) {
    return auditData.details?.items?.map((item: any) => ({
      element: item.node?.snippet || 'Image element',
      issue: 'Missing alt attribute',
      selector: item.node?.selector,
      location: item.source
    })) || [];
  }

  private async identifyLowContrastElements(auditData: any) {
    return auditData.details?.items?.map((item: any) => ({
      element: item.node?.snippet || 'Text element',
      issue: `Contrast ratio ${item.contrastRatio} below required ${item.expectedContrastRatio}`,
      selector: item.node?.selector
    })) || [];
  }

  private createGenericDiagnostic(auditId: string, auditData: any, context: DiagnosticContext): DiagnosticResult {
    return {
      auditId,
      severity: 'minor',
      impact: 'medium',
      category: 'performance',
      problemDescription: `${auditId} audit failed`,
      rootCauses: ['Unknown - audit mapping not found'],
      affectedElements: [],
      primarySolution: {
        strategy: 'manual-review',
        description: 'Manual review required for this audit',
        aiActions: [],
        settings: {},
        estimatedImpact: 0,
        riskLevel: 'medium',
        implementation: {
          steps: ['Review audit details manually', 'Consult documentation', 'Implement fix', 'Test changes'],
          estimatedTime: 60,
          prerequisites: [],
          verificationSteps: ['Re-run PageSpeed Insights audit']
        }
      },
      alternativeSolutions: [],
      preventionTips: [],
      monitoringRecommendations: []
    };
  }

  private async generateImplementationPhases(
    auditMapping: AdvancedAuditMapping,
    siteProfile: SiteProfile,
    selectedSolution?: string
  ) {
    // Generate detailed implementation phases
    return [
      {
        phase: 1,
        name: 'Analysis & Preparation',
        description: 'Analyze current state and prepare for implementation',
        steps: [
          {
            step: 1,
            action: 'Backup current implementation',
            details: 'Create backup of all files that will be modified',
            estimatedTime: 5,
            riskLevel: 'low',
            verificationStep: 'Verify backup is complete and accessible'
          },
          {
            step: 2,
            action: 'Analyze current implementation',
            details: 'Understand current code structure and identify optimization opportunities',
            estimatedTime: 10,
            riskLevel: 'low',
            verificationStep: 'Document current state and optimization targets'
          }
        ],
        estimatedTime: 15,
        prerequisites: auditMapping.prerequisites,
        deliverables: ['Backup files', 'Analysis report', 'Implementation plan']
      },
      {
        phase: 2,
        name: 'Implementation',
        description: 'Apply the optimization changes',
        steps: [
          {
            step: 1,
            action: 'Apply optimization settings',
            details: 'Configure optimization settings according to the recommended strategy',
            estimatedTime: auditMapping.estimatedTime,
            riskLevel: auditMapping.riskLevel,
            verificationStep: 'Verify settings are applied correctly',
            rollbackPlan: 'Restore original settings from backup'
          }
        ],
        estimatedTime: auditMapping.estimatedTime,
        prerequisites: [],
        deliverables: ['Optimized implementation']
      }
    ];
  }

  private assessImplementationRisk(
    auditMapping: AdvancedAuditMapping,
    siteProfile: SiteProfile,
    phases: any[]
  ) {
    return {
      overallRisk: auditMapping.riskLevel,
      riskFactors: [
        `${auditMapping.riskLevel} risk optimization`,
        `${siteProfile.complexity} site complexity`,
        `${auditMapping.solutionComplexity} solution complexity`
      ],
      mitigationStrategies: [
        'Comprehensive backup before changes',
        'Staged implementation with testing',
        'Automated rollback procedures'
      ]
    };
  }

  private generateSuccessCriteria(auditMapping: AdvancedAuditMapping): string[] {
    return [
      `${auditMapping.title} audit passes in PageSpeed Insights`,
      'No functional regressions detected',
      'Performance improvement measurable',
      'All verification steps completed successfully'
    ];
  }

  private createRollbackStrategy(auditMapping: AdvancedAuditMapping, phases: any[]): string {
    return `If issues are detected: 1) Stop optimization process immediately, 2) Restore from backup files, 3) Verify original functionality, 4) Analyze failure root cause, 5) Adjust strategy and retry with safer settings. Rollback complexity: ${auditMapping.rollbackComplexity}`;
  }
}

// Export singleton instance
export const auditDiagnosticsEngine = new AuditDiagnosticsEngine();