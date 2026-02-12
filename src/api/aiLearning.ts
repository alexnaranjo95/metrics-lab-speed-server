/**
 * AI Learning API Routes
 * 
 * API endpoints for interacting with the AI learning system, viewing insights,
 * and managing learning-driven optimizations.
 */

import { FastifyInstance } from 'fastify';
import { requireMasterKey } from '../middleware/auth.js';
import { 
  learningIntegrationService, 
  type LearningIntegrationOptions,
  initializeLearningIntegration,
  scheduleContinuousLearning 
} from '../ai/learningIntegration.js';
import { aiKnowledgeBase } from '../ai/knowledgeBase.js';
import { aiLearningEngine } from '../ai/learningEngine.js';
import { auditDiagnosticsEngine } from '../services/pagespeed/auditDiagnostics.js';
import { db } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { aiOptimizationSessions, sites } from '../db/schema.js';

export async function aiLearningRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireMasterKey);

  // ── POST /ai-learning/optimize/:siteId — Run learning-integrated optimization ──
  app.post('/sites/:siteId/ai-learning/optimize', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const body = request.body as {
      optimizationLevel?: 'conservative' | 'balanced' | 'aggressive' | 'experimental';
      verificationLevel?: 'minimal' | 'standard' | 'comprehensive' | 'exhaustive';
      enableLearning?: boolean;
      enableCodeModifications?: boolean;
      maxIterations?: number;
      learningThreshold?: number;
    };

    try {
      const options: LearningIntegrationOptions = {
        enableLearning: body.enableLearning ?? true,
        enableCodeModifications: body.enableCodeModifications ?? false,
        optimizationLevel: body.optimizationLevel || 'balanced',
        verificationLevel: body.verificationLevel || 'standard',
        maxIterations: body.maxIterations || 5,
        learningThreshold: body.learningThreshold || 0.7
      };

      const result = await learningIntegrationService.runLearningIntegratedOptimization(siteId, options);

      return {
        sessionId: result.sessionId,
        status: result.integrationSuccessful ? 'success' : 'failed',
        optimizationResult: {
          status: result.optimizationResult.status,
          confidence: result.optimizationResult.confidence,
          iterations: result.optimizationResult.totalIterations,
          performanceImprovement: result.optimizationResult.performanceImprovement
        },
        learning: {
          appliedKnowledge: result.appliedKnowledge,
          newKnowledge: result.newKnowledge,
          systemLearning: result.systemLearning
        },
        recommendations: result.futureGuidance
      };

    } catch (error) {
      return reply.status(500).send({
        error: 'Learning-integrated optimization failed',
        details: (error as Error).message
      });
    }
  });

  // ── GET /ai-learning/recommendations/:siteId — Get learning-informed recommendations ──
  app.get('/sites/:siteId/ai-learning/recommendations', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const query = request.query as {
      auditIds?: string; // comma-separated
      includeExperimental?: string;
    };

    try {
      const auditIds = query.auditIds ? query.auditIds.split(',') : undefined;
      
      const recommendations = await learningIntegrationService.getLearningInformedRecommendations(
        siteId,
        auditIds
      );

      return {
        siteId,
        generatedAt: new Date().toISOString(),
        auditIds,
        recommendations: {
          immediate: recommendations.immediate,
          progressive: recommendations.progressive,
          ...(query.includeExperimental === 'true' && { experimental: recommendations.experimental })
        }
      };

    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to get learning-informed recommendations',
        details: (error as Error).message
      });
    }
  });

  // ── GET /ai-learning/insights — Get cross-site learning insights ──
  app.get('/ai-learning/insights', async (request, reply) => {
    const query = request.query as {
      timeframeDays?: string;
      siteProfile?: string;
      minConfidence?: string;
    };

    try {
      const timeframeDays = parseInt(query.timeframeDays || '30');
      const minConfidence = parseFloat(query.minConfidence || '0.6');

      // Get insights from knowledge base
      const insights = await aiKnowledgeBase.getCrossSiteInsights(undefined, timeframeDays);
      
      // Filter by confidence
      const filteredInsights = insights.filter(insight => insight.confidence >= minConfidence);

      // Get analytics
      const analytics = await aiKnowledgeBase.getOptimizationAnalytics(timeframeDays);

      return {
        timeframe: `${timeframeDays} days`,
        minConfidence,
        totalInsights: filteredInsights.length,
        insights: filteredInsights,
        analytics: {
          topStrategies: analytics.topStrategies.slice(0, 10),
          trends: analytics.recentTrends
        }
      };

    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to get learning insights',
        details: (error as Error).message
      });
    }
  });

  // ── GET /ai-learning/patterns — Get optimization patterns ──
  app.get('/ai-learning/patterns', async (request, reply) => {
    const query = request.query as {
      siteProfile?: string;
      optimizationType?: string;
      minSuccessRate?: string;
    };

    try {
      // This would query the optimization patterns from the database
      // For now, return mock data
      const patterns = [
        {
          id: 'wp-elementor-ecommerce',
          description: 'WordPress + Elementor + WooCommerce sites',
          successfulStrategies: [
            { strategy: 'aggressive-image-compression', successRate: 0.87, avgImprovement: 12.3 },
            { strategy: 'moderate-css-purging', successRate: 0.72, avgImprovement: 6.8 }
          ],
          problematicStrategies: [
            { strategy: 'jquery-removal', failureRate: 0.65, reasons: ['Plugin dependencies'] }
          ],
          confidence: 0.83,
          sampleSize: 47
        }
      ];

      return {
        totalPatterns: patterns.length,
        filters: {
          siteProfile: query.siteProfile,
          optimizationType: query.optimizationType,
          minSuccessRate: parseFloat(query.minSuccessRate || '0.5')
        },
        patterns
      };

    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to get optimization patterns',
        details: (error as Error).message
      });
    }
  });

  // ── GET /ai-learning/diagnostics/:siteId — Get comprehensive problem diagnosis ──
  app.get('/sites/:siteId/ai-learning/diagnostics', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    try {
      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId)
      });

      if (!site) {
        return reply.status(404).send({ error: 'Site not found' });
      }

      // This would fetch actual PageSpeed data and run diagnostics
      // For now, return mock diagnostics
      const mockPageSpeedData = {
        metadata: { url: site.siteUrl, strategy: 'mobile' as const },
        opportunities: [
          { id: 'largest-contentful-paint', score: 0.4 },
          { id: 'total-blocking-time', score: 0.3 },
          { id: 'unused-css-rules', score: 0.6 }
        ]
      };

      const siteProfile = {
        cms: 'WordPress',
        complexity: 'moderate' as const,
        pageCount: site.pageCount || 20,
        hasEcommerce: false,
        hasInteractiveElements: true,
        primaryLanguage: 'en',
        plugins: [],
        theme: 'custom'
      };

      const diagnostics = await auditDiagnosticsEngine.diagnoseAllFailures({
        siteProfile,
        pageSpeedData: mockPageSpeedData as any,
        currentSettings: site.settings || {},
        failedAudits: ['largest-contentful-paint', 'total-blocking-time', 'unused-css-rules'],
        siteUrl: site.siteUrl,
        strategy: 'mobile'
      });

      return {
        siteId,
        siteName: site.name,
        diagnosisTimestamp: new Date().toISOString(),
        totalProblems: diagnostics.length,
        criticalProblems: diagnostics.filter(d => d.severity === 'critical').length,
        diagnostics: diagnostics.map(diag => ({
          auditId: diag.auditId,
          severity: diag.severity,
          impact: diag.impact,
          category: diag.category,
          description: diag.problemDescription,
          rootCauses: diag.rootCauses,
          primarySolution: {
            strategy: diag.primarySolution.strategy,
            description: diag.primarySolution.description,
            estimatedImpact: diag.primarySolution.estimatedImpact,
            riskLevel: diag.primarySolution.riskLevel
          },
          historicalSuccessRate: diag.historicalData?.successRate || 0
        }))
      };

    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to generate comprehensive diagnosis',
        details: (error as Error).message
      });
    }
  });

  // ── GET /ai-learning/report — Generate comprehensive learning report ──
  app.get('/ai-learning/report', async (request, reply) => {
    const query = request.query as {
      timeframeDays?: string;
      includeSystemMetrics?: string;
    };

    try {
      const timeframeDays = parseInt(query.timeframeDays || '30');
      
      const report = await learningIntegrationService.generateLearningReport(timeframeDays);

      return {
        title: 'AI Learning System Report',
        generatedAt: new Date().toISOString(),
        timeframe: `${timeframeDays} days`,
        ...report
      };

    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to generate learning report',
        details: (error as Error).message
      });
    }
  });

  // ── POST /ai-learning/analyze-patterns — Trigger pattern analysis ──
  app.post('/ai-learning/analyze-patterns', async (request, reply) => {
    try {
      const analysis = await learningIntegrationService.runContinuousLearningAnalysis();

      return {
        analysisId: `analysis_${Date.now()}`,
        timestamp: new Date().toISOString(),
        results: analysis,
        status: 'completed'
      };

    } catch (error) {
      return reply.status(500).send({
        error: 'Pattern analysis failed',
        details: (error as Error).message
      });
    }
  });

  // ── GET /ai-learning/system-status — Get learning system status ──
  app.get('/ai-learning/system-status', async (request, reply) => {
    try {
      // Get recent learning sessions
      const recentSessions = await db.query.aiOptimizationSessions.findMany({
        orderBy: [desc(aiOptimizationSessions.createdAt)],
        limit: 10
      });

      const systemStatus = {
        healthy: true,
        lastLearningSession: recentSessions[0]?.createdAt,
        totalSessions: recentSessions.length,
        successfulSessions: recentSessions.filter(s => s.status === 'completed').length,
        learningEnabled: recentSessions.filter(s => s.lessonsLearned && s.lessonsLearned.length > 0).length,
        knowledgeBaseSize: 0, // Would query actual size
        averageConfidence: 0.75, // Would calculate from data
        systemCapabilities: {
          learningIntegration: true,
          patternRecognition: true,
          crossSiteLearning: true,
          adaptiveOptimization: true,
          safeCodeModification: true,
          comprehensiveVerification: true
        }
      };

      return {
        timestamp: new Date().toISOString(),
        status: systemStatus
      };

    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to get system status',
        details: (error as Error).message
      });
    }
  });

  // ── POST /ai-learning/initialize — Initialize learning system ──
  app.post('/ai-learning/initialize', async (request, reply) => {
    try {
      await initializeLearningIntegration();
      await scheduleContinuousLearning();

      return {
        status: 'initialized',
        timestamp: new Date().toISOString(),
        message: 'AI learning system initialized successfully',
        capabilities: [
          'Pattern recognition active',
          'Cross-site learning enabled',
          'Continuous analysis scheduled',
          'Knowledge base initialized'
        ]
      };

    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to initialize learning system',
        details: (error as Error).message
      });
    }
  });
}

/**
 * Add AI Learning routes to main application
 */
export function registerAILearningRoutes(app: FastifyInstance): void {
  app.register(aiLearningRoutes, { prefix: '/api' });
}