/**
 * AI Learning Engine
 * 
 * Advanced pattern recognition and success tracking system that learns from
 * optimization attempts across all sites to improve future AI decision-making.
 */

import { db } from '../db/index.js';
import { 
  aiOptimizationSessions, 
  optimizationKnowledgeBase, 
  pageSpeedAuditSolutions,
  optimizationPatterns,
  sites,
  builds
} from '../db/schema.js';
import { eq, desc, and, gte, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export interface SiteProfile {
  cms: string;
  theme?: string;
  plugins: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  pageCount: number;
  hasEcommerce: boolean;
  hasInteractiveElements: boolean;
  primaryLanguage: string;
}

export interface OptimizationOutcome {
  sessionId: string;
  siteId: string;
  siteProfile: SiteProfile;
  optimizationType: string;
  settings: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'partial';
  performanceImprovement: number;
  failureReason?: string;
  timestamp: Date;
}

export interface LearningPattern {
  id: string;
  patternType: 'site-profile' | 'audit-combination' | 'failure-mode';
  description: string;
  conditions: Record<string, unknown>;
  recommendedActions: Array<{
    action: string;
    priority: number;
    confidence: number;
    expectedImpact: number;
    settings: Record<string, unknown>;
  }>;
  avoidedActions: Array<{
    action: string;
    reason: string;
    riskLevel: string;
  }>;
  confidence: number;
  sampleSize: number;
}

export interface PatternMatchResult {
  patterns: LearningPattern[];
  confidence: number;
  recommendations: {
    apply: string[];
    avoid: string[];
    customize: Array<{
      setting: string;
      value: unknown;
      reason: string;
    }>;
  };
}

export class AILearningEngine {
  /**
   * Record an optimization outcome for learning
   */
  async recordOptimizationOutcome(outcome: OptimizationOutcome): Promise<void> {
    try {
      // Store the optimization session data
      await db.insert(aiOptimizationSessions).values({
        id: outcome.sessionId,
        siteId: outcome.siteId,
        sessionType: 'optimization_learning',
        aiModel: 'claude-opus-4.6',
        status: outcome.outcome === 'success' ? 'completed' : 'failed',
        optimizationPlan: {
          targetOptimization: outcome.optimizationType,
          appliedSettings: outcome.settings,
        },
        finalScores: {
          improvement: outcome.performanceImprovement
        },
        successfulOptimizations: outcome.outcome === 'success' ? [{
          type: outcome.optimizationType,
          settings: outcome.settings,
          impact: outcome.performanceImprovement,
          confidence: this.calculateOutcomeConfidence(outcome)
        }] : [],
        failedOptimizations: outcome.outcome === 'failure' ? [{
          type: outcome.optimizationType,
          settings: outcome.settings,
          failureReason: outcome.failureReason || 'Unknown',
          rollbackTrigger: 'performance_regression'
        }] : [],
        completedAt: outcome.timestamp,
      });

      // Update knowledge base patterns
      await this.updateKnowledgeBase(outcome);
      
      // Update optimization patterns
      await this.updateOptimizationPatterns(outcome);

    } catch (error) {
      console.error('Failed to record optimization outcome:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Analyze a site profile and return matching optimization patterns
   */
  async analyzeOptimizationPatterns(siteProfile: SiteProfile): Promise<PatternMatchResult> {
    try {
      const profileKey = this.generateSiteProfileKey(siteProfile);
      
      // Find matching knowledge base entries
      const knowledgeEntries = await this.findMatchingKnowledge(siteProfile);
      
      // Find matching optimization patterns
      const optimizationPatterns = await this.findMatchingPatterns(siteProfile);
      
      // Combine and prioritize recommendations
      const patterns = await this.combinePatternInsights(knowledgeEntries, optimizationPatterns);
      
      // Calculate overall confidence
      const confidence = this.calculatePatternConfidence(patterns);
      
      // Generate actionable recommendations
      const recommendations = this.generateRecommendations(patterns, siteProfile);

      return {
        patterns,
        confidence,
        recommendations
      };

    } catch (error) {
      console.error('Failed to analyze optimization patterns:', (error as Error).message);
      return {
        patterns: [],
        confidence: 0,
        recommendations: { apply: [], avoid: [], customize: [] }
      };
    }
  }

  /**
   * Learn from PageSpeed audit outcomes to improve audit-specific solutions
   */
  async learnFromPageSpeedAudit(
    auditId: string,
    category: string,
    siteProfile: SiteProfile,
    solution: {
      type: string;
      settings: Record<string, unknown>;
      codeChanges?: unknown;
    },
    outcome: {
      success: boolean;
      improvement: number;
      failureReason?: string;
    }
  ): Promise<void> {
    try {
      // Find or create audit solution entry
      let auditSolution = await db.query.pageSpeedAuditSolutions.findFirst({
        where: and(
          eq(pageSpeedAuditSolutions.auditId, auditId),
          eq(pageSpeedAuditSolutions.solutionType, solution.type)
        )
      });

      if (!auditSolution) {
        // Create new audit solution entry
        const solutionId = `pas_${nanoid(12)}`;
        await db.insert(pageSpeedAuditSolutions).values({
          id: solutionId,
          auditId,
          category,
          solutionType: solution.type,
          description: `AI-learned solution for ${auditId}`,
          successRate: outcome.success ? 1 : 0,
          averageImprovement: outcome.improvement,
          sampleSize: 1,
          requiredSettings: solution.settings,
          codeChangesRequired: solution.codeChanges,
          riskLevel: this.assessRiskLevel(solution, siteProfile),
          commonFailureReasons: outcome.success ? [] : [outcome.failureReason || 'Unknown'],
        });
      } else {
        // Update existing audit solution with new data
        const newSampleSize = auditSolution.sampleSize + 1;
        const newSuccessCount = auditSolution.successRate * auditSolution.sampleSize + (outcome.success ? 1 : 0);
        const newSuccessRate = newSuccessCount / newSampleSize;
        
        const newImprovementSum = auditSolution.averageImprovement * auditSolution.sampleSize + outcome.improvement;
        const newAverageImprovement = newImprovementSum / newSampleSize;

        const updatedFailureReasons = [...(auditSolution.commonFailureReasons || [])];
        if (!outcome.success && outcome.failureReason) {
          updatedFailureReasons.push(outcome.failureReason);
        }

        await db.update(pageSpeedAuditSolutions)
          .set({
            successRate: newSuccessRate,
            averageImprovement: newAverageImprovement,
            sampleSize: newSampleSize,
            commonFailureReasons: updatedFailureReasons,
            updatedAt: new Date()
          })
          .where(eq(pageSpeedAuditSolutions.id, auditSolution.id));
      }

    } catch (error) {
      console.error('Failed to learn from PageSpeed audit:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Get best practices for a specific optimization type based on learning
   */
  async getBestPractices(
    optimizationType: string,
    siteProfile: SiteProfile
  ): Promise<{
    recommendedSettings: Record<string, unknown>;
    successRate: number;
    riskFactors: string[];
    prerequisites: string[];
  }> {
    try {
      const profileKey = this.generateSiteProfileKey(siteProfile);
      
      // Find knowledge base entry for this site profile
      const knowledge = await db.query.optimizationKnowledgeBase.findFirst({
        where: eq(optimizationKnowledgeBase.patternHash, profileKey)
      });

      if (knowledge?.successfulStrategies) {
        const strategy = knowledge.successfulStrategies.find(s => s.strategy === optimizationType);
        if (strategy) {
          return {
            recommendedSettings: strategy.optimalSettings,
            successRate: strategy.successRate,
            riskFactors: [], // Would come from problematic strategies
            prerequisites: strategy.prerequisites
          };
        }
      }

      // Fallback to general best practices from patterns
      const patterns = await db.query.optimizationPatterns.findMany({
        where: and(
          eq(optimizationPatterns.patternType, 'site-profile'),
          sql`${optimizationPatterns.conditions}->>'cms' = ${siteProfile.cms}`
        ),
        orderBy: [desc(optimizationPatterns.confidence)]
      });

      if (patterns.length > 0) {
        const bestPattern = patterns[0];
        const recommendation = bestPattern.recommendedActions?.find(a => a.action === optimizationType);
        
        if (recommendation) {
          return {
            recommendedSettings: recommendation.settings,
            successRate: recommendation.confidence,
            riskFactors: bestPattern.avoidedActions?.map(a => a.reason) || [],
            prerequisites: []
          };
        }
      }

      // Default fallback
      return {
        recommendedSettings: {},
        successRate: 0.5,
        riskFactors: ['No historical data available'],
        prerequisites: []
      };

    } catch (error) {
      console.error('Failed to get best practices:', (error as Error).message);
      return {
        recommendedSettings: {},
        successRate: 0.5,
        riskFactors: ['Analysis error'],
        prerequisites: []
      };
    }
  }

  /**
   * Identify optimization patterns across multiple sites
   */
  async identifyNewPatterns(): Promise<{
    newPatterns: number;
    updatedPatterns: number;
    insights: string[];
  }> {
    try {
      let newPatterns = 0;
      let updatedPatterns = 0;
      const insights: string[] = [];

      // Analyze recent optimization sessions for pattern discovery
      const recentSessions = await db.query.aiOptimizationSessions.findMany({
        where: gte(aiOptimizationSessions.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // Last 30 days
        with: {
          site: true
        },
        limit: 1000
      });

      // Group sessions by site characteristics
      const profileGroups = this.groupSessionsByProfile(recentSessions);

      // Analyze each group for patterns
      for (const [profileKey, sessions] of profileGroups.entries()) {
        if (sessions.length < 3) continue; // Need minimum sample size

        const pattern = await this.analyzeSessionGroup(profileKey, sessions);
        if (pattern) {
          // Check if pattern already exists
          const existing = await db.query.optimizationPatterns.findFirst({
            where: eq(optimizationPatterns.patternDescription, pattern.description)
          });

          if (existing) {
            // Update existing pattern
            await this.updateExistingPattern(existing.id, pattern);
            updatedPatterns++;
          } else {
            // Create new pattern
            await this.createNewPattern(pattern);
            newPatterns++;
          }

          // Extract insights
          if (pattern.confidence > 0.8) {
            insights.push(`High-confidence pattern discovered: ${pattern.description}`);
          }
        }
      }

      return {
        newPatterns,
        updatedPatterns,
        insights
      };

    } catch (error) {
      console.error('Failed to identify new patterns:', (error as Error).message);
      return {
        newPatterns: 0,
        updatedPatterns: 0,
        insights: [`Analysis error: ${(error as Error).message}`]
      };
    }
  }

  // Private helper methods

  private generateSiteProfileKey(profile: SiteProfile): string {
    const keyData = {
      cms: profile.cms,
      complexity: profile.complexity,
      hasEcommerce: profile.hasEcommerce,
      hasInteractiveElements: profile.hasInteractiveElements,
      plugins: profile.plugins.sort()
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex')
      .substring(0, 16);
  }

  private async updateKnowledgeBase(outcome: OptimizationOutcome): Promise<void> {
    const profileKey = this.generateSiteProfileKey(outcome.siteProfile);
    
    // Find or create knowledge base entry
    let knowledge = await db.query.optimizationKnowledgeBase.findFirst({
      where: eq(optimizationKnowledgeBase.patternHash, profileKey)
    });

    if (!knowledge) {
      // Create new knowledge base entry
      const knowledgeId = `kb_${nanoid(12)}`;
      await db.insert(optimizationKnowledgeBase).values({
        id: knowledgeId,
        patternName: `${outcome.siteProfile.cms} + ${outcome.siteProfile.complexity}`,
        patternHash: profileKey,
        siteCharacteristics: {
          cms: outcome.siteProfile.cms,
          complexity: outcome.siteProfile.complexity,
          plugins: outcome.siteProfile.plugins,
          commonTraits: []
        },
        successfulStrategies: outcome.outcome === 'success' ? [{
          strategy: outcome.optimizationType,
          successRate: 1,
          averageImprovement: outcome.performanceImprovement,
          sampleSize: 1,
          optimalSettings: outcome.settings,
          prerequisites: []
        }] : [],
        problematicStrategies: outcome.outcome === 'failure' ? [{
          strategy: outcome.optimizationType,
          failureRate: 1,
          commonFailureReasons: [outcome.failureReason || 'Unknown'],
          sampleSize: 1,
          avoidanceConditions: []
        }] : [],
        confidence: 0.5,
        sampleSize: 1
      });
    } else {
      // Update existing knowledge base entry
      await this.updateExistingKnowledge(knowledge, outcome);
    }
  }

  private async updateExistingKnowledge(
    knowledge: any, 
    outcome: OptimizationOutcome
  ): Promise<void> {
    const successfulStrategies = [...(knowledge.successfulStrategies || [])];
    const problematicStrategies = [...(knowledge.problematicStrategies || [])];

    if (outcome.outcome === 'success') {
      // Update or add successful strategy
      const existingIndex = successfulStrategies.findIndex(s => s.strategy === outcome.optimizationType);
      if (existingIndex >= 0) {
        const existing = successfulStrategies[existingIndex];
        const newSampleSize = existing.sampleSize + 1;
        const newAvgImprovement = (existing.averageImprovement * existing.sampleSize + outcome.performanceImprovement) / newSampleSize;
        
        successfulStrategies[existingIndex] = {
          ...existing,
          averageImprovement: newAvgImprovement,
          sampleSize: newSampleSize,
          // Keep most effective settings
          optimalSettings: outcome.performanceImprovement > existing.averageImprovement 
            ? outcome.settings 
            : existing.optimalSettings
        };
      } else {
        successfulStrategies.push({
          strategy: outcome.optimizationType,
          successRate: 1,
          averageImprovement: outcome.performanceImprovement,
          sampleSize: 1,
          optimalSettings: outcome.settings,
          prerequisites: []
        });
      }
    } else if (outcome.outcome === 'failure') {
      // Update or add problematic strategy
      const existingIndex = problematicStrategies.findIndex(s => s.strategy === outcome.optimizationType);
      if (existingIndex >= 0) {
        const existing = problematicStrategies[existingIndex];
        problematicStrategies[existingIndex] = {
          ...existing,
          sampleSize: existing.sampleSize + 1,
          commonFailureReasons: [...existing.commonFailureReasons, outcome.failureReason || 'Unknown']
        };
      } else {
        problematicStrategies.push({
          strategy: outcome.optimizationType,
          failureRate: 1,
          commonFailureReasons: [outcome.failureReason || 'Unknown'],
          sampleSize: 1,
          avoidanceConditions: []
        });
      }
    }

    // Update the knowledge base entry
    await db.update(optimizationKnowledgeBase)
      .set({
        successfulStrategies,
        problematicStrategies,
        sampleSize: knowledge.sampleSize + 1,
        confidence: this.calculateKnowledgeConfidence(successfulStrategies, problematicStrategies),
        lastValidated: new Date(),
        updatedAt: new Date()
      })
      .where(eq(optimizationKnowledgeBase.id, knowledge.id));
  }

  private async updateOptimizationPatterns(outcome: OptimizationOutcome): Promise<void> {
    // Implementation for updating optimization patterns
    // This would analyze the outcome and update relevant patterns
  }

  private async findMatchingKnowledge(profile: SiteProfile): Promise<any[]> {
    const profileKey = this.generateSiteProfileKey(profile);
    
    return await db.query.optimizationKnowledgeBase.findMany({
      where: eq(optimizationKnowledgeBase.patternHash, profileKey),
      orderBy: [desc(optimizationKnowledgeBase.confidence)]
    });
  }

  private async findMatchingPatterns(profile: SiteProfile): Promise<any[]> {
    return await db.query.optimizationPatterns.findMany({
      where: and(
        eq(optimizationPatterns.patternType, 'site-profile'),
        sql`${optimizationPatterns.conditions}->>'cms' = ${profile.cms}`,
        sql`${optimizationPatterns.conditions}->>'complexity' = ${profile.complexity}`
      ),
      orderBy: [desc(optimizationPatterns.confidence)]
    });
  }

  private async combinePatternInsights(knowledgeEntries: any[], patterns: any[]): Promise<LearningPattern[]> {
    // Combine knowledge base and pattern insights into unified recommendations
    const combinedPatterns: LearningPattern[] = [];

    // Process knowledge base entries
    for (const knowledge of knowledgeEntries) {
      if (knowledge.successfulStrategies) {
        combinedPatterns.push({
          id: knowledge.id,
          patternType: 'site-profile',
          description: knowledge.patternName,
          conditions: knowledge.siteCharacteristics,
          recommendedActions: knowledge.successfulStrategies.map((s: any) => ({
            action: s.strategy,
            priority: 1,
            confidence: s.successRate,
            expectedImpact: s.averageImprovement,
            settings: s.optimalSettings
          })),
          avoidedActions: (knowledge.problematicStrategies || []).map((s: any) => ({
            action: s.strategy,
            reason: s.commonFailureReasons[0] || 'Historical failures',
            riskLevel: 'high'
          })),
          confidence: knowledge.confidence,
          sampleSize: knowledge.sampleSize
        });
      }
    }

    // Process optimization patterns
    for (const pattern of patterns) {
      combinedPatterns.push({
        id: pattern.id,
        patternType: pattern.patternType,
        description: pattern.patternDescription,
        conditions: pattern.conditions,
        recommendedActions: pattern.recommendedActions || [],
        avoidedActions: pattern.avoidedActions || [],
        confidence: pattern.confidence,
        sampleSize: pattern.timesApplied
      });
    }

    return combinedPatterns;
  }

  private calculatePatternConfidence(patterns: LearningPattern[]): number {
    if (patterns.length === 0) return 0;
    
    const totalWeightedConfidence = patterns.reduce((sum, pattern) => {
      return sum + (pattern.confidence * pattern.sampleSize);
    }, 0);
    
    const totalSampleSize = patterns.reduce((sum, pattern) => sum + pattern.sampleSize, 0);
    
    return totalWeightedConfidence / totalSampleSize;
  }

  private generateRecommendations(patterns: LearningPattern[], profile: SiteProfile) {
    const apply: string[] = [];
    const avoid: string[] = [];
    const customize: Array<{ setting: string; value: unknown; reason: string }> = [];

    // Aggregate recommendations from all patterns
    for (const pattern of patterns) {
      // High-confidence recommendations to apply
      pattern.recommendedActions
        .filter(action => action.confidence > 0.7)
        .forEach(action => {
          if (!apply.includes(action.action)) {
            apply.push(action.action);
          }
        });

      // Actions to avoid based on failures
      pattern.avoidedActions
        .filter(action => action.riskLevel === 'high')
        .forEach(action => {
          if (!avoid.includes(action.action)) {
            avoid.push(action.action);
          }
        });
    }

    return { apply, avoid, customize };
  }

  private calculateOutcomeConfidence(outcome: OptimizationOutcome): number {
    // Calculate confidence based on outcome quality
    if (outcome.outcome === 'success' && outcome.performanceImprovement > 10) return 0.9;
    if (outcome.outcome === 'success' && outcome.performanceImprovement > 5) return 0.7;
    if (outcome.outcome === 'success') return 0.5;
    return 0.1;
  }

  private calculateKnowledgeConfidence(successful: any[], problematic: any[]): number {
    const totalSuccessful = successful.reduce((sum, s) => sum + s.sampleSize, 0);
    const totalProblematic = problematic.reduce((sum, p) => sum + p.sampleSize, 0);
    const totalSamples = totalSuccessful + totalProblematic;
    
    if (totalSamples === 0) return 0.5;
    
    const successRate = totalSuccessful / totalSamples;
    return Math.min(successRate + (totalSamples / 100), 1); // Boost confidence with more samples
  }

  private assessRiskLevel(solution: any, profile: SiteProfile): string {
    // Assess risk based on solution type and site profile
    if (solution.type.includes('jquery-removal') && profile.hasInteractiveElements) return 'high';
    if (solution.type.includes('css-purging') && profile.complexity === 'complex') return 'medium';
    return 'low';
  }

  private groupSessionsByProfile(sessions: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    
    for (const session of sessions) {
      // Generate profile key from site characteristics
      const profileKey = session.site ? this.generateSiteProfileFromSite(session.site) : 'unknown';
      
      if (!groups.has(profileKey)) {
        groups.set(profileKey, []);
      }
      groups.get(profileKey)!.push(session);
    }
    
    return groups;
  }

  private generateSiteProfileFromSite(site: any): string {
    // Extract site characteristics and generate profile key
    // This would analyze site data to determine CMS, plugins, etc.
    return 'generic-profile'; // Simplified for now
  }

  private async analyzeSessionGroup(profileKey: string, sessions: any[]): Promise<LearningPattern | null> {
    // Analyze a group of sessions to identify patterns
    const successfulSessions = sessions.filter(s => s.status === 'completed');
    const failedSessions = sessions.filter(s => s.status === 'failed');
    
    if (successfulSessions.length < 2) return null; // Need minimum successes

    // Create pattern from analysis
    return {
      id: `pattern_${nanoid(12)}`,
      patternType: 'site-profile',
      description: `Pattern for profile ${profileKey}`,
      conditions: { profileKey },
      recommendedActions: [], // Would extract from successful sessions
      avoidedActions: [],     // Would extract from failed sessions
      confidence: successfulSessions.length / sessions.length,
      sampleSize: sessions.length
    };
  }

  private async updateExistingPattern(patternId: string, pattern: LearningPattern): Promise<void> {
    // Update an existing pattern with new data
    await db.update(optimizationPatterns)
      .set({
        confidence: pattern.confidence,
        timesApplied: sql`${optimizationPatterns.timesApplied} + 1`,
        lastApplied: new Date(),
        updatedAt: new Date()
      })
      .where(eq(optimizationPatterns.id, patternId));
  }

  private async createNewPattern(pattern: LearningPattern): Promise<void> {
    // Create a new optimization pattern
    await db.insert(optimizationPatterns).values({
      id: pattern.id,
      patternType: pattern.patternType,
      patternDescription: pattern.description,
      conditions: pattern.conditions,
      recommendedActions: pattern.recommendedActions,
      avoidedActions: pattern.avoidedActions,
      timesApplied: 1,
      successfulApplications: pattern.confidence > 0.5 ? 1 : 0,
      confidence: pattern.confidence
    });
  }
}

// Export singleton instance
export const aiLearningEngine = new AILearningEngine();