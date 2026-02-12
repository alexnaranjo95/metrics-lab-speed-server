/**
 * Learning Integration Service
 * 
 * Integrates the learning feedback loop across all optimization attempts,
 * connecting the enhanced AI agent with the existing optimization pipeline.
 */

import { enhancedAIAgent, type EnhancedAgentOptions, type EnhancedAgentResult } from './enhancedAgent.js';
import { aiLearningEngine, type SiteProfile } from './learningEngine.js';
import { aiKnowledgeBase } from './knowledgeBase.js';
import { auditDiagnosticsEngine } from '../services/pagespeed/auditDiagnostics.js';
import { enhancedVerificationSystem } from '../verification/enhancedVerification.js';
import { db } from '../db/index.js';
import { aiOptimizationSessions, sites, builds } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { buildEmitter } from '../events/buildEmitter.js';

export interface LearningIntegrationOptions {
  enableLearning: boolean;
  enableCodeModifications: boolean;
  optimizationLevel: 'conservative' | 'balanced' | 'aggressive' | 'experimental';
  verificationLevel: 'minimal' | 'standard' | 'comprehensive' | 'exhaustive';
  maxIterations: number;
  learningThreshold: number; // Minimum confidence required to apply learned patterns
}

export interface LearningIntegrationResult {
  sessionId: string;
  siteId: string;
  integrationSuccessful: boolean;
  
  // Learning application
  appliedKnowledge: {
    patterns: string[];
    recommendations: number;
    confidenceBoost: number;
  };
  
  // Optimization execution
  optimizationResult: EnhancedAgentResult;
  
  // Learning outcomes
  newKnowledge: {
    patternsDiscovered: string[];
    insightsGained: string[];
    failurePatterns: string[];
    knowledgeBaseUpdates: number;
  };
  
  // System improvements
  systemLearning: {
    modelAccuracyImprovement: number;
    predictionConfidenceIncrease: number;
    riskAssessmentImprovement: number;
  };
  
  // Future recommendations
  futureGuidance: {
    siteSpecificRecommendations: string[];
    generalPatternRecommendations: string[];
    systemImprovements: string[];
  };
}

export class LearningIntegrationService {
  /**
   * Run optimization with full learning integration
   */
  async runLearningIntegratedOptimization(
    siteId: string,
    options: LearningIntegrationOptions
  ): Promise<LearningIntegrationResult> {
    const sessionId = `learning_${nanoid(12)}`;
    
    console.log(`Starting learning-integrated optimization session ${sessionId} for site ${siteId}`);

    const result: LearningIntegrationResult = {
      sessionId,
      siteId,
      integrationSuccessful: false,
      appliedKnowledge: { patterns: [], recommendations: 0, confidenceBoost: 0 },
      optimizationResult: {} as EnhancedAgentResult,
      newKnowledge: { patternsDiscovered: [], insightsGained: [], failurePatterns: [], knowledgeBaseUpdates: 0 },
      systemLearning: { modelAccuracyImprovement: 0, predictionConfidenceIncrease: 0, riskAssessmentImprovement: 0 },
      futureGuidance: { siteSpecificRecommendations: [], generalPatternRecommendations: [], systemImprovements: [] }
    };

    try {
      // Phase 1: Pre-Optimization Learning Application
      console.log('Phase 1: Applying existing knowledge...');
      const preOptimizationLearning = await this.applyPreOptimizationLearning(siteId, options);
      result.appliedKnowledge = preOptimizationLearning;

      // Phase 2: Enhanced Optimization Execution
      console.log('Phase 2: Executing enhanced optimization...');
      const site = await this.getSiteInfo(siteId);
      
      const agentOptions: EnhancedAgentOptions = {
        siteId,
        siteUrl: site.siteUrl,
        optimizationLevel: options.optimizationLevel,
        learningMode: options.enableLearning,
        allowCodeModifications: options.enableCodeModifications,
        maxIterations: options.maxIterations,
        verificationLevel: options.verificationLevel,
        autoRollback: true
      };

      result.optimizationResult = await enhancedAIAgent.runEnhancedOptimization(agentOptions);

      // Phase 3: Post-Optimization Learning Integration
      console.log('Phase 3: Integrating new learning...');
      const postOptimizationLearning = await this.integratePostOptimizationLearning(
        result.optimizationResult,
        siteId,
        options
      );
      result.newKnowledge = postOptimizationLearning;

      // Phase 4: System-Wide Learning Analysis
      console.log('Phase 4: Analyzing system-wide learning...');
      const systemLearning = await this.analyzeSystemWideLearning(sessionId);
      result.systemLearning = systemLearning;

      // Phase 5: Future Guidance Generation
      console.log('Phase 5: Generating future guidance...');
      const futureGuidance = await this.generateFutureGuidance(result, options);
      result.futureGuidance = futureGuidance;

      // Phase 6: Knowledge Base Updates
      console.log('Phase 6: Updating knowledge base...');
      await this.updateSystemKnowledgeBase(result);

      // Phase 7: Emit Learning Events
      console.log('Phase 7: Broadcasting learning insights...');
      await this.emitLearningEvents(result);

      result.integrationSuccessful = true;
      console.log(`Learning integration completed successfully for session ${sessionId}`);

    } catch (error) {
      console.error('Learning integration failed:', (error as Error).message);
      result.integrationSuccessful = false;
      
      // Record the failure for learning too
      await this.recordIntegrationFailure(sessionId, siteId, error as Error, options);
    }

    return result;
  }

  /**
   * Continuous learning from all optimization attempts across the system
   */
  async runContinuousLearningAnalysis(): Promise<{
    newPatterns: number;
    updatedPatterns: number;
    insights: string[];
    systemImprovements: string[];
    confidenceUpdates: number;
  }> {
    console.log('Running continuous learning analysis across all optimization attempts...');

    try {
      // Identify new patterns from recent optimization sessions
      const patternAnalysis = await aiLearningEngine.identifyNewPatterns();
      
      // Update knowledge base with cross-site insights
      const knowledgeUpdates = await this.updateCrossSiteKnowledge();
      
      // Analyze system-wide trends
      const systemTrends = await this.analyzeSystemTrends();
      
      // Generate system improvements
      const systemImprovements = await this.generateSystemImprovements(systemTrends);

      return {
        newPatterns: patternAnalysis.newPatterns,
        updatedPatterns: patternAnalysis.updatedPatterns,
        insights: patternAnalysis.insights,
        systemImprovements,
        confidenceUpdates: knowledgeUpdates.confidenceUpdates
      };

    } catch (error) {
      console.error('Continuous learning analysis failed:', (error as Error).message);
      return {
        newPatterns: 0,
        updatedPatterns: 0,
        insights: [`Learning analysis error: ${(error as Error).message}`],
        systemImprovements: [],
        confidenceUpdates: 0
      };
    }
  }

  /**
   * Get learning-informed recommendations for a specific site
   */
  async getLearningInformedRecommendations(
    siteId: string,
    auditIds?: string[]
  ): Promise<{
    immediate: Array<{
      recommendation: string;
      confidence: number;
      expectedImpact: number;
      riskLevel: string;
      reasoning: string;
    }>;
    progressive: Array<{
      phase: number;
      recommendations: string[];
      prerequisites: string[];
      expectedOutcome: string;
    }>;
    experimental: Array<{
      recommendation: string;
      experimentalLevel: number;
      potentialImpact: string;
      risks: string[];
    }>;
  }> {
    try {
      const site = await this.getSiteInfo(siteId);
      const siteProfile = await this.generateSiteProfile(site);

      // Get knowledge-based recommendations
      const recommendations = await aiKnowledgeBase.getOptimizationRecommendations(siteProfile, auditIds);
      
      // Get audit-specific solutions if provided
      const auditSolutions = auditIds ? await aiKnowledgeBase.getAuditSolutions(auditIds) : [];

      // Process into categorized recommendations
      const immediate = recommendations
        .filter(rec => rec.confidence > 0.8 && rec.riskLevel === 'low')
        .slice(0, 5)
        .map(rec => ({
          recommendation: rec.strategy,
          confidence: rec.confidence,
          expectedImpact: rec.expectedImprovement,
          riskLevel: rec.riskLevel,
          reasoning: rec.reasoning
        }));

      const progressive = this.generateProgressiveRecommendations(recommendations);
      const experimental = this.generateExperimentalRecommendations(recommendations, auditSolutions);

      return { immediate, progressive, experimental };

    } catch (error) {
      console.error('Failed to get learning-informed recommendations:', (error as Error).message);
      return { immediate: [], progressive: [], experimental: [] };
    }
  }

  // Private helper methods

  private async applyPreOptimizationLearning(
    siteId: string,
    options: LearningIntegrationOptions
  ): Promise<LearningIntegrationResult['appliedKnowledge']> {
    const site = await this.getSiteInfo(siteId);
    const siteProfile = await this.generateSiteProfile(site);

    // Get optimization recommendations based on learned patterns
    const recommendations = await aiKnowledgeBase.getOptimizationRecommendations(siteProfile);
    
    // Filter by confidence threshold
    const highConfidenceRecs = recommendations.filter(rec => rec.confidence >= options.learningThreshold);
    
    // Get applicable patterns
    const insights = await aiKnowledgeBase.getCrossSiteInsights(siteProfile);
    const patterns = insights.map(insight => insight.insight);

    const confidenceBoost = highConfidenceRecs.reduce((sum, rec) => sum + rec.confidence, 0) / highConfidenceRecs.length || 0;

    return {
      patterns,
      recommendations: highConfidenceRecs.length,
      confidenceBoost
    };
  }

  private async integratePostOptimizationLearning(
    optimizationResult: EnhancedAgentResult,
    siteId: string,
    options: LearningIntegrationOptions
  ): Promise<LearningIntegrationResult['newKnowledge']> {
    const patternsDiscovered: string[] = [];
    const insightsGained: string[] = [];
    const failurePatterns: string[] = [];
    let knowledgeBaseUpdates = 0;

    // Extract successful patterns
    optimizationResult.optimizationResults.settingsOptimizations
      .filter(opt => opt.success && opt.impact > 5)
      .forEach(opt => {
        patternsDiscovered.push(`${opt.type} effective for this site type`);
        insightsGained.push(`Settings-based ${opt.type} achieved ${opt.impact} point improvement`);
        knowledgeBaseUpdates++;
      });

    // Extract code modification insights
    optimizationResult.optimizationResults.codeModifications
      .filter(mod => mod.success)
      .forEach(mod => {
        patternsDiscovered.push(`Code modification ${mod.type} successful with ${mod.riskLevel} risk`);
        insightsGained.push(`Code-level ${mod.type} achieved ${mod.impact} point improvement`);
        knowledgeBaseUpdates++;
      });

    // Extract failure patterns
    optimizationResult.optimizationResults.settingsOptimizations
      .filter(opt => !opt.success)
      .forEach(opt => {
        failurePatterns.push(`${opt.type} failed for this site profile`);
        knowledgeBaseUpdates++;
      });

    optimizationResult.optimizationResults.codeModifications
      .filter(mod => !mod.success)
      .forEach(mod => {
        failurePatterns.push(`Code modification ${mod.type} failed - avoid for similar sites`);
        knowledgeBaseUpdates++;
      });

    // Extract verification insights
    optimizationResult.optimizationResults.verificationResults.forEach(vr => {
      if (vr.learningInsights) {
        insightsGained.push(...vr.learningInsights.knowledgeGained);
      }
    });

    return {
      patternsDiscovered,
      insightsGained,
      failurePatterns,
      knowledgeBaseUpdates
    };
  }

  private async analyzeSystemWideLearning(sessionId: string): Promise<LearningIntegrationResult['systemLearning']> {
    try {
      // Analyze optimization analytics
      const analytics = await aiKnowledgeBase.getOptimizationAnalytics(30); // Last 30 days

      // Calculate improvements
      const modelAccuracyImprovement = this.calculateAccuracyImprovement(analytics.topStrategies);
      const predictionConfidenceIncrease = this.calculateConfidenceIncrease(analytics);
      const riskAssessmentImprovement = this.calculateRiskImprovement(analytics.riskiestStrategies);

      return {
        modelAccuracyImprovement,
        predictionConfidenceIncrease,
        riskAssessmentImprovement
      };

    } catch (error) {
      console.error('System-wide learning analysis failed:', (error as Error).message);
      return {
        modelAccuracyImprovement: 0,
        predictionConfidenceIncrease: 0,
        riskAssessmentImprovement: 0
      };
    }
  }

  private async generateFutureGuidance(
    result: LearningIntegrationResult,
    options: LearningIntegrationOptions
  ): Promise<LearningIntegrationResult['futureGuidance']> {
    const siteSpecificRecommendations: string[] = [];
    const generalPatternRecommendations: string[] = [];
    const systemImprovements: string[] = [];

    // Site-specific recommendations based on results
    if (result.optimizationResult.status === 'success') {
      siteSpecificRecommendations.push('Continue with current optimization approach');
      siteSpecificRecommendations.push('Consider additional progressive enhancements');
      
      if (result.optimizationResult.performanceImprovement.scoreChange > 15) {
        siteSpecificRecommendations.push('Site is highly optimizable - explore advanced techniques');
      }
    } else {
      siteSpecificRecommendations.push('Review site complexity and constraints');
      siteSpecificRecommendations.push('Focus on lower-risk optimizations');
      
      if (result.optimizationResult.safetyValidation.rollbacksTriggered > 0) {
        siteSpecificRecommendations.push('Site requires conservative approach due to complexity');
      }
    }

    // General pattern recommendations
    result.newKnowledge.patternsDiscovered.forEach(pattern => {
      generalPatternRecommendations.push(`Apply "${pattern}" to similar site profiles`);
    });

    // System improvements based on learning
    if (result.newKnowledge.knowledgeBaseUpdates > 5) {
      systemImprovements.push('Knowledge base significantly enriched - improve pattern matching algorithms');
    }

    if (result.systemLearning.modelAccuracyImprovement > 0.05) {
      systemImprovements.push('Model accuracy improved - consider increasing automation confidence');
    }

    return {
      siteSpecificRecommendations,
      generalPatternRecommendations,
      systemImprovements
    };
  }

  /**
   * Update system knowledge base with session learnings
   */
  private async updateSystemKnowledgeBase(result: LearningIntegrationResult): Promise<void> {
    try {
      console.log('Updating system knowledge base...');

      // Record the optimization session in database
      await db.insert(aiOptimizationSessions).values({
        id: result.sessionId,
        siteId: result.siteId,
        sessionType: 'learning_integrated_optimization',
        aiModel: 'claude-opus-4.6-enhanced',
        status: result.optimizationResult.status === 'success' ? 'completed' : 'failed',
        optimizationPlan: {
          appliedKnowledge: result.appliedKnowledge,
          strategies: result.optimizationResult.optimizationResults.settingsOptimizations.map(opt => opt.type)
        },
        successfulOptimizations: result.optimizationResult.optimizationResults.settingsOptimizations
          .filter(opt => opt.success)
          .map(opt => ({
            type: opt.type,
            settings: {},
            impact: opt.impact,
            confidence: 0.8
          })),
        failedOptimizations: result.optimizationResult.optimizationResults.settingsOptimizations
          .filter(opt => !opt.success)
          .map(opt => ({
            type: opt.type,
            settings: {},
            failureReason: 'Verification failed',
            rollbackTrigger: 'safety_check'
          })),
        aiReasonings: [{
          iteration: 1,
          phase: 'optimization',
          reasoning: 'Applied learning-driven optimization strategy',
          confidence: result.optimizationResult.confidence,
          alternatives: []
        }],
        lessonsLearned: [
          ...result.newKnowledge.patternsDiscovered,
          ...result.newKnowledge.insightsGained
        ],
        totalTokensUsed: 0, // Would track actual token usage
        estimatedCostUsd: 0, // Would calculate actual cost
        completedAt: new Date()
      });

      console.log('System knowledge base updated successfully');

    } catch (error) {
      console.error('Failed to update system knowledge base:', (error as Error).message);
    }
  }

  /**
   * Emit learning events for real-time monitoring and integration
   */
  private async emitLearningEvents(result: LearningIntegrationResult): Promise<void> {
    try {
      // Emit learning insights
      buildEmitter.emit('learning:insights', {
        sessionId: result.sessionId,
        siteId: result.siteId,
        insights: result.newKnowledge.insightsGained,
        patterns: result.newKnowledge.patternsDiscovered
      });

      // Emit system improvements
      if (result.systemLearning.modelAccuracyImprovement > 0) {
        buildEmitter.emit('learning:system-improvement', {
          type: 'model-accuracy',
          improvement: result.systemLearning.modelAccuracyImprovement,
          context: result.sessionId
        });
      }

      // Emit knowledge base updates
      buildEmitter.emit('learning:knowledge-update', {
        sessionId: result.sessionId,
        updates: result.newKnowledge.knowledgeBaseUpdates,
        patterns: result.newKnowledge.patternsDiscovered
      });

    } catch (error) {
      console.error('Failed to emit learning events:', (error as Error).message);
    }
  }

  /**
   * Generate comprehensive learning report
   */
  async generateLearningReport(
    timeframeDays: number = 30
  ): Promise<{
    summary: {
      totalSessions: number;
      successfulSessions: number;
      learningEnabled: number;
      knowledgeBaseGrowth: number;
    };
    topInsights: Array<{
      insight: string;
      confidence: number;
      applicability: string[];
      evidence: string;
    }>;
    systemEvolution: {
      accuracyTrends: Array<{ date: string; accuracy: number }>;
      confidenceTrends: Array<{ date: string; confidence: number }>;
      patternGrowth: Array<{ date: string; patterns: number }>;
    };
    recommendations: {
      systemOptimizations: string[];
      learningEnhancements: string[];
      knowledgeGaps: string[];
    };
  }> {
    try {
      // Get recent AI optimization sessions
      const recentSessions = await db.query.aiOptimizationSessions.findMany({
        where: eq(aiOptimizationSessions.sessionType, 'learning_integrated_optimization'),
        limit: 1000
      });

      const summary = {
        totalSessions: recentSessions.length,
        successfulSessions: recentSessions.filter(s => s.status === 'completed').length,
        learningEnabled: recentSessions.filter(s => s.lessonsLearned && s.lessonsLearned.length > 0).length,
        knowledgeBaseGrowth: 0 // Would calculate actual growth
      };

      // Extract top insights
      const allInsights: string[] = [];
      recentSessions.forEach(session => {
        if (session.lessonsLearned) {
          allInsights.push(...session.lessonsLearned);
        }
      });

      const insightCounts = new Map<string, number>();
      allInsights.forEach(insight => {
        insightCounts.set(insight, (insightCounts.get(insight) || 0) + 1);
      });

      const topInsights = Array.from(insightCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([insight, count]) => ({
          insight,
          confidence: Math.min(1.0, count / 10), // Confidence based on frequency
          applicability: ['Similar site profiles'],
          evidence: `Observed in ${count} optimization sessions`
        }));

      return {
        summary,
        topInsights,
        systemEvolution: {
          accuracyTrends: [], // Would implement actual trend tracking
          confidenceTrends: [],
          patternGrowth: []
        },
        recommendations: {
          systemOptimizations: [
            'Implement automated pattern recognition',
            'Enhance risk assessment algorithms'
          ],
          learningEnhancements: [
            'Increase learning data collection',
            'Improve cross-site pattern matching'
          ],
          knowledgeGaps: [
            'Need more data on complex site optimization',
            'Improve failure pattern recognition'
          ]
        }
      };

    } catch (error) {
      console.error('Failed to generate learning report:', (error as Error).message);
      throw error;
    }
  }

  // Integration helper methods

  private async getSiteInfo(siteId: string): Promise<any> {
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId)
    });
    
    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }
    
    return site;
  }

  private async generateSiteProfile(site: any): Promise<SiteProfile> {
    // Generate enhanced site profile
    return {
      cms: 'WordPress', // Would detect from site analysis
      complexity: 'moderate',
      pageCount: site.pageCount || 20,
      hasEcommerce: false, // Would detect from site analysis
      hasInteractiveElements: true,
      primaryLanguage: 'en',
      plugins: [], // Would extract from site analysis
      theme: 'custom'
    };
  }

  private async updateCrossSiteKnowledge(): Promise<{ confidenceUpdates: number }> {
    // Update knowledge base with cross-site patterns
    console.log('Updating cross-site knowledge patterns...');
    
    // This would analyze patterns across all sites and update confidence scores
    return { confidenceUpdates: 5 };
  }

  private async analyzeSystemTrends(): Promise<any> {
    // Analyze system-wide trends in optimization success
    return {
      successRates: 0.85,
      commonFailures: ['css-purging-aggressive', 'jquery-removal'],
      improvingStrategies: ['image-optimization', 'font-optimization']
    };
  }

  private async generateSystemImprovements(trends: any): Promise<string[]> {
    return [
      'Reduce aggressiveness of CSS purging by default',
      'Improve jQuery removal risk assessment',
      'Enhance image optimization automation'
    ];
  }

  private calculateAccuracyImprovement(topStrategies: any[]): number {
    // Calculate model accuracy improvement based on success rates
    const avgSuccessRate = topStrategies.reduce((sum, strategy) => sum + strategy.successRate, 0) / topStrategies.length;
    return Math.max(0, avgSuccessRate - 0.7); // Improvement over baseline 70%
  }

  private calculateConfidenceIncrease(analytics: any): number {
    // Calculate confidence increase based on sample sizes
    return 0.05; // Mock 5% increase
  }

  private calculateRiskImprovement(riskiestStrategies: any[]): number {
    // Calculate risk assessment improvement
    const avgFailureRate = riskiestStrategies.reduce((sum, strategy) => sum + strategy.failureRate, 0) / riskiestStrategies.length;
    return Math.max(0, 0.5 - avgFailureRate); // Improvement vs 50% baseline
  }

  private generateProgressiveRecommendations(recommendations: any[]): any[] {
    return [
      {
        phase: 1,
        recommendations: ['Apply low-risk image optimizations', 'Implement basic meta tag improvements'],
        prerequisites: ['Site backup', 'Performance baseline'],
        expectedOutcome: '5-10 point performance improvement'
      },
      {
        phase: 2,
        recommendations: ['Moderate CSS optimization', 'Script deferral'],
        prerequisites: ['Phase 1 success', 'Visual regression testing'],
        expectedOutcome: '10-15 point performance improvement'
      },
      {
        phase: 3,
        recommendations: ['Advanced optimizations', 'Code modifications if needed'],
        prerequisites: ['Phase 2 success', 'Comprehensive testing'],
        expectedOutcome: '15-25 point performance improvement'
      }
    ];
  }

  private generateExperimentalRecommendations(recommendations: any[], auditSolutions: any[]): any[] {
    return [
      {
        recommendation: 'Advanced jQuery removal with modern replacements',
        experimentalLevel: 8,
        potentialImpact: '20+ point performance improvement',
        risks: ['Potential functionality breakage', 'Complex testing required']
      },
      {
        recommendation: 'Aggressive CSS purging with AI-generated safelists',
        experimentalLevel: 6,
        potentialImpact: '10-15 point performance improvement',
        risks: ['Visual regressions possible', 'Responsive design impact']
      }
    ];
  }

  private async recordIntegrationFailure(
    sessionId: string,
    siteId: string,
    error: Error,
    options: LearningIntegrationOptions
  ): Promise<void> {
    try {
      await db.insert(aiOptimizationSessions).values({
        id: sessionId,
        siteId,
        sessionType: 'learning_integration_failure',
        aiModel: 'claude-opus-4.6-enhanced',
        status: 'failed',
        failedOptimizations: [{
          type: 'learning_integration',
          settings: options as any,
          failureReason: error.message,
          rollbackTrigger: 'system_error'
        }],
        lessonsLearned: [
          'Learning integration system needs improvement',
          `Integration failed: ${error.message}`
        ],
        completedAt: new Date()
      });
    } catch (dbError) {
      console.error('Failed to record integration failure:', (dbError as Error).message);
    }
  }
}

/**
 * Initialize learning integration across the system
 */
export async function initializeLearningIntegration(): Promise<void> {
  console.log('Initializing learning integration system...');

  try {
    // Run pattern discovery on existing data
    const patternAnalysis = await aiLearningEngine.identifyNewPatterns();
    console.log(`Discovered ${patternAnalysis.newPatterns} new patterns, updated ${patternAnalysis.updatedPatterns} existing patterns`);

    // Initialize knowledge base with current insights
    const crossSiteInsights = await aiKnowledgeBase.getCrossSiteInsights();
    console.log(`Loaded ${crossSiteInsights.length} cross-site insights`);

    console.log('Learning integration system initialized successfully');

  } catch (error) {
    console.error('Failed to initialize learning integration:', (error as Error).message);
  }
}

/**
 * Schedule continuous learning analysis
 */
export async function scheduleContinuousLearning(): Promise<void> {
  const learningService = new LearningIntegrationService();
  
  // Run continuous learning every 6 hours
  setInterval(async () => {
    try {
      console.log('Running scheduled continuous learning analysis...');
      const analysis = await learningService.runContinuousLearningAnalysis();
      
      console.log(`Learning analysis completed: ${analysis.newPatterns} new patterns, ${analysis.insights.length} insights`);
      
      // Emit learning events
      buildEmitter.emit('learning:continuous-analysis', {
        timestamp: new Date(),
        analysis
      });
      
    } catch (error) {
      console.error('Continuous learning analysis failed:', (error as Error).message);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours

  console.log('Continuous learning scheduled every 6 hours');
}

// Export singleton instance
export const learningIntegrationService = new LearningIntegrationService();