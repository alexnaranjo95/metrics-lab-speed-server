/**
 * AI Knowledge Base
 * 
 * Central repository for optimization knowledge, patterns, and cross-site learning.
 * Provides intelligent recommendations based on accumulated experience.
 */

import { db } from '../db/index.js';
import { 
  optimizationKnowledgeBase, 
  pageSpeedAuditSolutions,
  optimizationPatterns,
  aiOptimizationSessions 
} from '../db/schema.js';
import { eq, desc, and, sql, gt, gte, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { SiteProfile } from './learningEngine.js';

export interface OptimizationRecommendation {
  strategy: string;
  confidence: number;
  expectedImprovement: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  settings: Record<string, unknown>;
  reasoning: string;
  prerequisites: string[];
  alternatives: string[];
  successRate: number;
  sampleSize: number;
}

export interface AuditSolutionRecommendation {
  auditId: string;
  solutions: Array<{
    type: string;
    description: string;
    confidence: number;
    settings: Record<string, unknown>;
    codeChanges?: unknown;
    riskLevel: string;
    successRate: number;
    estimatedImprovement: number;
  }>;
  bestPractices: string[];
  commonPitfalls: string[];
}

export interface CrossSiteInsight {
  insight: string;
  confidence: number;
  applicableProfiles: string[];
  supportingEvidence: {
    successfulCases: number;
    failedCases: number;
    averageImprovement: number;
  };
  recommendations: string[];
}

export class AIKnowledgeBase {
  /**
   * Get optimization recommendations for a specific site profile
   */
  async getOptimizationRecommendations(
    siteProfile: SiteProfile,
    targetAudits?: string[]
  ): Promise<OptimizationRecommendation[]> {
    try {
      const recommendations: OptimizationRecommendation[] = [];

      // Get recommendations from knowledge base
      const knowledgeRecommendations = await this.getKnowledgeBaseRecommendations(siteProfile);
      recommendations.push(...knowledgeRecommendations);

      // Get audit-specific recommendations if specified
      if (targetAudits && targetAudits.length > 0) {
        const auditRecommendations = await this.getAuditSpecificRecommendations(targetAudits, siteProfile);
        recommendations.push(...auditRecommendations);
      }

      // Get pattern-based recommendations
      const patternRecommendations = await this.getPatternBasedRecommendations(siteProfile);
      recommendations.push(...patternRecommendations);

      // Deduplicate and prioritize
      const deduplicatedRecommendations = this.deduplicateRecommendations(recommendations);
      
      // Sort by confidence and expected improvement
      return deduplicatedRecommendations.sort((a, b) => 
        (b.confidence * b.expectedImprovement) - (a.confidence * a.expectedImprovement)
      );

    } catch (error) {
      console.error('Failed to get optimization recommendations:', (error as Error).message);
      return [];
    }
  }

  /**
   * Get specific solutions for PageSpeed audit failures
   */
  async getAuditSolutions(auditIds: string[]): Promise<AuditSolutionRecommendation[]> {
    try {
      const solutions: AuditSolutionRecommendation[] = [];

      for (const auditId of auditIds) {
        const auditSolutions = await db.query.pageSpeedAuditSolutions.findMany({
          where: eq(pageSpeedAuditSolutions.auditId, auditId),
          orderBy: [desc(pageSpeedAuditSolutions.successRate)]
        });

        if (auditSolutions.length > 0) {
          solutions.push({
            auditId,
            solutions: auditSolutions.map(solution => ({
              type: solution.solutionType,
              description: solution.description,
              confidence: solution.successRate,
              settings: solution.requiredSettings || {},
              codeChanges: solution.codeChangesRequired,
              riskLevel: solution.riskLevel,
              successRate: solution.successRate,
              estimatedImprovement: solution.averageImprovement
            })),
            bestPractices: this.extractBestPractices(auditSolutions),
            commonPitfalls: this.extractCommonPitfalls(auditSolutions)
          });
        }
      }

      return solutions;

    } catch (error) {
      console.error('Failed to get audit solutions:', (error as Error).message);
      return [];
    }
  }

  /**
   * Get cross-site insights and patterns
   */
  async getCrossSiteInsights(
    siteProfile?: SiteProfile,
    timeframeDays: number = 90
  ): Promise<CrossSiteInsight[]> {
    try {
      const insights: CrossSiteInsight[] = [];

      // Get optimization patterns with high confidence
      const patterns = await db.query.optimizationPatterns.findMany({
        where: and(
          gt(optimizationPatterns.confidence, 0.7),
          gt(optimizationPatterns.timesApplied, 5)
        ),
        orderBy: [desc(optimizationPatterns.confidence)]
      });

      for (const pattern of patterns) {
        const successes = pattern.successfulApplications ?? 0;
        const times = pattern.timesApplied ?? 0;
        const successRate = times > 0 ? successes / times : 0;
        
        insights.push({
          insight: pattern.patternDescription,
          confidence: pattern.confidence ?? 0.5,
          applicableProfiles: this.extractApplicableProfiles(pattern),
          supportingEvidence: {
            successfulCases: successes,
            failedCases: Math.max(0, times - successes),
            averageImprovement: pattern.averageImprovement ?? 0
          },
          recommendations: this.generatePatternRecommendations(pattern)
        });
      }

      // Get knowledge base insights
      const knowledgeInsights = await this.getKnowledgeBaseInsights(siteProfile);
      insights.push(...knowledgeInsights);

      return insights.sort((a, b) => b.confidence - a.confidence);

    } catch (error) {
      console.error('Failed to get cross-site insights:', (error as Error).message);
      return [];
    }
  }

  /**
   * Record successful optimization for learning
   */
  async recordSuccessfulOptimization(
    strategy: string,
    siteProfile: SiteProfile,
    settings: Record<string, unknown>,
    improvement: number,
    sessionDetails?: {
      sessionId: string;
      auditIds: string[];
      verificationResults: unknown;
    }
  ): Promise<void> {
    try {
      // Update knowledge base
      await this.updateKnowledgeBase(strategy, siteProfile, settings, improvement, true);
      
      // Update audit solutions if audit IDs provided
      if (sessionDetails?.auditIds) {
        for (const auditId of sessionDetails.auditIds) {
          await this.updateAuditSolution(auditId, strategy, settings, improvement, true);
        }
      }

      // Update optimization patterns
      await this.updateOptimizationPatterns(strategy, siteProfile, improvement, true);

    } catch (error) {
      console.error('Failed to record successful optimization:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Record failed optimization for learning
   */
  async recordFailedOptimization(
    strategy: string,
    siteProfile: SiteProfile,
    settings: Record<string, unknown>,
    failureReason: string,
    sessionDetails?: {
      sessionId: string;
      auditIds: string[];
      rollbackReason: string;
    }
  ): Promise<void> {
    try {
      // Update knowledge base with failure
      await this.updateKnowledgeBase(strategy, siteProfile, settings, 0, false, failureReason);
      
      // Update audit solutions with failure if audit IDs provided
      if (sessionDetails?.auditIds) {
        for (const auditId of sessionDetails.auditIds) {
          await this.updateAuditSolution(auditId, strategy, settings, 0, false, failureReason);
        }
      }

      // Update optimization patterns with failure
      await this.updateOptimizationPatterns(strategy, siteProfile, 0, false);

    } catch (error) {
      console.error('Failed to record failed optimization:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Get optimization trends and analytics
   */
  async getOptimizationAnalytics(timeframeDays: number = 30): Promise<{
    topStrategies: Array<{ strategy: string; successRate: number; attempts: number; avgImprovement: number }>;
    riskiestStrategies: Array<{ strategy: string; failureRate: number; commonFailures: string[] }>;
    siteProfilePerformance: Array<{ profile: string; successRate: number; avgImprovement: number }>;
    recentTrends: {
      improving: string[];
      declining: string[];
      emerging: string[];
    };
  }> {
    try {
      // Analyze recent optimization sessions
      const recentSessions = await db.query.aiOptimizationSessions.findMany({
        where: gte(aiOptimizationSessions.createdAt, new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000)),
        orderBy: [desc(aiOptimizationSessions.createdAt)]
      });

      // Process sessions for analytics
      const strategyStats = new Map<string, { successes: number; failures: number; improvements: number[] }>();
      
      for (const session of recentSessions) {
        const strategies = Array.isArray(session.successfulOptimizations) ? session.successfulOptimizations as Array<{ type: string; impact: number }> : [];
        const failures = Array.isArray(session.failedOptimizations) ? session.failedOptimizations as Array<{ type: string }> : [];
        
        // Process successful optimizations
        for (const success of strategies) {
          if (!strategyStats.has(success.type)) {
            strategyStats.set(success.type, { successes: 0, failures: 0, improvements: [] });
          }
          const stats = strategyStats.get(success.type)!;
          stats.successes++;
          stats.improvements.push(success.impact);
        }
        
        // Process failed optimizations
        for (const failure of failures) {
          if (!strategyStats.has(failure.type)) {
            strategyStats.set(failure.type, { successes: 0, failures: 0, improvements: [] });
          }
          const stats = strategyStats.get(failure.type)!;
          stats.failures++;
        }
      }

      // Calculate top strategies
      const topStrategies = Array.from(strategyStats.entries())
        .map(([strategy, stats]) => ({
          strategy,
          successRate: stats.successes / (stats.successes + stats.failures),
          attempts: stats.successes + stats.failures,
          avgImprovement: stats.improvements.length > 0 
            ? stats.improvements.reduce((sum, imp) => sum + imp, 0) / stats.improvements.length 
            : 0
        }))
        .filter(s => s.attempts >= 3)
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 10);

      // Calculate riskiest strategies
      const riskiestStrategies = Array.from(strategyStats.entries())
        .map(([strategy, stats]) => ({
          strategy,
          failureRate: stats.failures / (stats.successes + stats.failures),
          commonFailures: [] // Would extract from detailed failure data
        }))
        .filter(s => s.failureRate > 0.3)
        .sort((a, b) => b.failureRate - a.failureRate)
        .slice(0, 10);

      return {
        topStrategies,
        riskiestStrategies,
        siteProfilePerformance: [], // Would calculate from site profile analysis
        recentTrends: {
          improving: topStrategies.filter(s => s.successRate > 0.8).map(s => s.strategy),
          declining: riskiestStrategies.filter(s => s.failureRate > 0.5).map(s => s.strategy),
          emerging: [] // Would identify new strategies with growing success
        }
      };

    } catch (error) {
      console.error('Failed to get optimization analytics:', (error as Error).message);
      return {
        topStrategies: [],
        riskiestStrategies: [],
        siteProfilePerformance: [],
        recentTrends: { improving: [], declining: [], emerging: [] }
      };
    }
  }

  // Private helper methods

  private async getKnowledgeBaseRecommendations(siteProfile: SiteProfile): Promise<OptimizationRecommendation[]> {
    const profileKey = this.generateProfileKey(siteProfile);
    
    const knowledgeEntries = await db.query.optimizationKnowledgeBase.findMany({
      where: eq(optimizationKnowledgeBase.patternHash, profileKey),
      orderBy: [desc(optimizationKnowledgeBase.confidence)]
    });

    const recommendations: OptimizationRecommendation[] = [];

    for (const entry of knowledgeEntries) {
      if (entry.successfulStrategies) {
        for (const strategy of entry.successfulStrategies) {
          recommendations.push({
            strategy: strategy.strategy,
            confidence: strategy.successRate,
            expectedImprovement: strategy.averageImprovement,
            riskLevel: this.assessStrategyRisk(strategy.strategy, siteProfile),
            settings: strategy.optimalSettings,
            reasoning: `Based on ${strategy.sampleSize} successful applications on similar sites`,
            prerequisites: strategy.prerequisites,
            alternatives: [], // Would extract from other strategies
            successRate: strategy.successRate,
            sampleSize: strategy.sampleSize
          });
        }
      }
    }

    return recommendations;
  }

  private async getAuditSpecificRecommendations(
    auditIds: string[], 
    siteProfile: SiteProfile
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];

    for (const auditId of auditIds) {
      const solutions = await db.query.pageSpeedAuditSolutions.findMany({
        where: and(
          eq(pageSpeedAuditSolutions.auditId, auditId),
          gt(pageSpeedAuditSolutions.successRate, 0.5)
        ),
        orderBy: [desc(pageSpeedAuditSolutions.successRate)]
      });

      for (const solution of solutions.slice(0, 3)) { // Top 3 solutions per audit
        recommendations.push({
          strategy: `${auditId}-${solution.solutionType}`,
          confidence: solution.successRate,
          expectedImprovement: solution.averageImprovement,
          riskLevel: solution.riskLevel as any,
          settings: solution.requiredSettings || {},
          reasoning: `Proven solution for ${auditId}: ${solution.description}`,
          prerequisites: this.extractPrerequisites(solution),
          alternatives: [], // Would find alternative solutions
          successRate: solution.successRate,
          sampleSize: solution.sampleSize
        });
      }
    }

    return recommendations;
  }

  private async getPatternBasedRecommendations(siteProfile: SiteProfile): Promise<OptimizationRecommendation[]> {
    const patterns = await db.query.optimizationPatterns.findMany({
      where: and(
        gt(optimizationPatterns.confidence, 0.6),
        sql`${optimizationPatterns.conditions}->>'cms' = ${siteProfile.cms}`
      ),
      orderBy: [desc(optimizationPatterns.confidence)]
    });

    const recommendations: OptimizationRecommendation[] = [];

    for (const pattern of patterns) {
      const actions = Array.isArray(pattern.recommendedActions) ? pattern.recommendedActions : [];
      if (actions.length > 0) {
        for (const action of actions) {
          recommendations.push({
            strategy: action.action,
            confidence: action.confidence,
            expectedImprovement: action.expectedImpact,
            riskLevel: this.assessActionRisk(action, pattern),
            settings: action.settings,
            reasoning: `Pattern-based recommendation: ${pattern.patternDescription}`,
            prerequisites: [],
            alternatives: [],
            successRate: (pattern.successfulApplications ?? 0) / Math.max(pattern.timesApplied ?? 1, 1),
            sampleSize: pattern.timesApplied ?? 0
          });
        }
      }
    }

    return recommendations;
  }

  private deduplicateRecommendations(recommendations: OptimizationRecommendation[]): OptimizationRecommendation[] {
    const seen = new Map<string, OptimizationRecommendation>();

    for (const rec of recommendations) {
      const existing = seen.get(rec.strategy);
      if (!existing || rec.confidence > existing.confidence) {
        seen.set(rec.strategy, rec);
      }
    }

    return Array.from(seen.values());
  }

  private generateProfileKey(profile: SiteProfile): string {
    // Generate a consistent key for the site profile
    return `${profile.cms}-${profile.complexity}-${profile.hasEcommerce ? 'ecom' : 'basic'}`;
  }

  private assessStrategyRisk(strategy: string, profile: SiteProfile): 'low' | 'medium' | 'high' | 'critical' {
    // Assess risk based on strategy and site profile
    if (strategy.includes('jquery-removal') && profile.hasInteractiveElements) return 'high';
    if (strategy.includes('css-purging-aggressive') && profile.complexity === 'complex') return 'high';
    if (strategy.includes('image-optimization')) return 'low';
    return 'medium';
  }

  private assessActionRisk(action: any, pattern: any): 'low' | 'medium' | 'high' | 'critical' {
    // Assess risk based on action and pattern context
    const avoidedActions = pattern.avoidedActions || [];
    const isAvoided = avoidedActions.some((avoided: any) => avoided.action === action.action);
    
    if (isAvoided) return 'high';
    if (action.confidence < 0.5) return 'medium';
    return 'low';
  }

  private extractBestPractices(solutions: any[]): string[] {
    // Extract best practices from successful solutions
    return solutions
      .filter(s => s.successRate > 0.8)
      .map(s => `High success rate approach: ${s.description}`)
      .slice(0, 5);
  }

  private extractCommonPitfalls(solutions: any[]): string[] {
    // Extract common pitfalls from solution data
    const pitfalls: string[] = [];
    
    for (const solution of solutions) {
      if (solution.commonFailureReasons) {
        pitfalls.push(...solution.commonFailureReasons);
      }
    }
    
    return [...new Set(pitfalls)].slice(0, 5);
  }

  private extractApplicableProfiles(pattern: any): string[] {
    // Extract applicable site profiles from pattern conditions
    const conditions = pattern.conditions || {};
    const profiles: string[] = [];
    
    if (conditions.cms) profiles.push(`${conditions.cms} sites`);
    if (conditions.complexity) profiles.push(`${conditions.complexity} complexity sites`);
    if (conditions.hasEcommerce) profiles.push('e-commerce sites');
    
    return profiles;
  }

  private generatePatternRecommendations(pattern: any): string[] {
    // Generate actionable recommendations from pattern data
    const recommendations: string[] = [];
    
    if (pattern.recommendedActions) {
      recommendations.push(...pattern.recommendedActions.map((action: any) => 
        `Apply ${action.action} with confidence ${Math.round(action.confidence * 100)}%`
      ));
    }
    
    if (pattern.avoidedActions) {
      recommendations.push(...pattern.avoidedActions.map((avoided: any) => 
        `Avoid ${avoided.action}: ${avoided.reason}`
      ));
    }
    
    return recommendations.slice(0, 3);
  }

  private async getKnowledgeBaseInsights(siteProfile?: SiteProfile): Promise<CrossSiteInsight[]> {
    // Get insights from knowledge base entries
    const insights: CrossSiteInsight[] = [];

    const knowledgeEntries = await db.query.optimizationKnowledgeBase.findMany({
      where: gt(optimizationKnowledgeBase.confidence, 0.7),
      orderBy: [desc(optimizationKnowledgeBase.confidence)]
    });

    for (const entry of knowledgeEntries) {
      if (entry.successfulStrategies && entry.successfulStrategies.length > 0) {
        const topStrategy = entry.successfulStrategies[0];
        
        insights.push({
          insight: `${entry.patternName} sites benefit most from ${topStrategy.strategy}`,
          confidence: entry.confidence,
          applicableProfiles: [entry.patternName],
          supportingEvidence: {
            successfulCases: topStrategy.sampleSize,
            failedCases: 0, // Would calculate from problematic strategies
            averageImprovement: topStrategy.averageImprovement
          },
          recommendations: [
            `Prioritize ${topStrategy.strategy} for ${entry.patternName} sites`,
            `Expected improvement: ${topStrategy.averageImprovement} points`
          ]
        });
      }
    }

    return insights;
  }

  private extractPrerequisites(solution: any): string[] {
    // Extract prerequisites from solution data
    const prerequisites: string[] = [];
    
    if (solution.siteRequirements?.cmsTypes) {
      prerequisites.push(`Compatible CMS: ${solution.siteRequirements.cmsTypes.join(', ')}`);
    }
    
    if (solution.siteRequirements?.requiredFeatures) {
      prerequisites.push(...solution.siteRequirements.requiredFeatures);
    }
    
    return prerequisites;
  }

  private async updateKnowledgeBase(
    strategy: string,
    siteProfile: SiteProfile,
    settings: Record<string, unknown>,
    improvement: number,
    success: boolean,
    failureReason?: string
  ): Promise<void> {
    // Implementation would update the knowledge base with new outcome
    // This is a placeholder for the actual implementation
  }

  private async updateAuditSolution(
    auditId: string,
    strategy: string,
    settings: Record<string, unknown>,
    improvement: number,
    success: boolean,
    failureReason?: string
  ): Promise<void> {
    // Implementation would update audit solutions with new outcome
    // This is a placeholder for the actual implementation
  }

  private async updateOptimizationPatterns(
    strategy: string,
    siteProfile: SiteProfile,
    improvement: number,
    success: boolean
  ): Promise<void> {
    // Implementation would update optimization patterns with new outcome
    // This is a placeholder for the actual implementation
  }
}

// Export singleton instance
export const aiKnowledgeBase = new AIKnowledgeBase();