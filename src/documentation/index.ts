/**
 * Dynamic Documentation Generation System
 * 
 * This module provides APIs for generating and serving dynamic documentation
 * about the AI optimization system, including real-time learning insights,
 * audit mappings, and optimization strategies.
 */

import { FastifyInstance } from 'fastify';
import { requireMasterKey } from '../middleware/auth.js';
import { generateOptimizationStrategiesDoc } from './optimizationStrategies.js';
import { generatePageSpeedAuditsDoc } from './pageSpeedAudits.js';
import { generateLearningHistoryDoc } from './learningHistory.js';
import { generateSystemOverviewDoc } from './systemOverview.js';

export async function documentationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireMasterKey);

  // ── GET /docs/system-overview — Complete system documentation ──
  app.get('/docs/system-overview', async (request, reply) => {
    try {
      const overview = await generateSystemOverviewDoc();
      return {
        title: 'AI Optimization System Overview',
        generatedAt: new Date().toISOString(),
        ...overview
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to generate system overview documentation',
        details: (error as Error).message 
      });
    }
  });

  // ── GET /docs/optimization-strategies — Available optimization strategies ──
  app.get('/docs/optimization-strategies', async (request, reply) => {
    try {
      const strategies = await generateOptimizationStrategiesDoc();
      return {
        title: 'Optimization Strategies Reference',
        generatedAt: new Date().toISOString(),
        totalStrategies: strategies.length,
        strategies
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to generate optimization strategies documentation',
        details: (error as Error).message 
      });
    }
  });

  // ── GET /docs/pagespeed-audits — Complete PageSpeed audit reference ──
  app.get('/docs/pagespeed-audits', async (request, reply) => {
    const query = request.query as {
      category?: 'performance' | 'accessibility' | 'seo' | 'best-practices';
      includeUnmapped?: string;
    };

    try {
      const audits = await generatePageSpeedAuditsDoc({
        category: query.category,
        includeUnmapped: query.includeUnmapped === 'true'
      });

      return {
        title: 'PageSpeed Audits Reference',
        generatedAt: new Date().toISOString(),
        category: query.category || 'all',
        totalAudits: audits.length,
        mappedAudits: audits.filter(a => a.mapped).length,
        unmappedAudits: audits.filter(a => !a.mapped).length,
        audits
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to generate PageSpeed audits documentation',
        details: (error as Error).message 
      });
    }
  });

  // ── GET /docs/learning-history/:siteId — Site-specific AI learning history ──
  app.get('/docs/learning-history/:siteId', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const query = request.query as {
      limit?: string;
      includeFailures?: string;
    };

    try {
      const history = await generateLearningHistoryDoc(siteId, {
        limit: parseInt(query.limit || '50', 10),
        includeFailures: query.includeFailures === 'true'
      });

      return {
        title: `AI Learning History for Site ${siteId}`,
        generatedAt: new Date().toISOString(),
        siteId,
        ...history
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to generate learning history documentation',
        details: (error as Error).message 
      });
    }
  });

  // ── GET /docs/optimization-patterns — Cross-site optimization patterns ──
  app.get('/docs/optimization-patterns', async (request, reply) => {
    const query = request.query as {
      minSuccessRate?: string;
      siteProfile?: string;
    };

    try {
      const { generateOptimizationPatternsDoc } = await import('./optimizationPatterns.js');
      const patterns = await generateOptimizationPatternsDoc({
        minSuccessRate: parseFloat(query.minSuccessRate || '0.5'),
        siteProfile: query.siteProfile
      });

      return {
        title: 'Cross-Site Optimization Patterns',
        generatedAt: new Date().toISOString(),
        totalPatterns: patterns.length,
        patterns
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to generate optimization patterns documentation',
        details: (error as Error).message 
      });
    }
  });

  // ── GET /docs/safety-mechanisms — Safety and risk management documentation ──
  app.get('/docs/safety-mechanisms', async (request, reply) => {
    try {
      const { generateSafetyMechanismsDoc } = await import('./safetyMechanisms.js');
      const safety = await generateSafetyMechanismsDoc();

      return {
        title: 'Safety Mechanisms and Risk Management',
        generatedAt: new Date().toISOString(),
        ...safety
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to generate safety mechanisms documentation',
        details: (error as Error).message 
      });
    }
  });

  // ── GET /docs/performance-metrics — Performance measurement documentation ──
  app.get('/docs/performance-metrics', async (request, reply) => {
    try {
      const { generatePerformanceMetricsDoc } = await import('./performanceMetrics.js');
      const metrics = await generatePerformanceMetricsDoc();

      return {
        title: 'Performance Metrics and Measurement',
        generatedAt: new Date().toISOString(),
        ...metrics
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to generate performance metrics documentation',
        details: (error as Error).message 
      });
    }
  });

  // ── GET /docs/search — Search documentation content ──
  app.get('/docs/search', async (request, reply) => {
    const query = request.query as {
      q: string;
      type?: 'strategies' | 'audits' | 'patterns' | 'all';
    };

    if (!query.q) {
      return reply.status(400).send({ error: 'Search query parameter "q" is required' });
    }

    try {
      const { searchDocumentation } = await import('./search.js');
      const results = await searchDocumentation(query.q, query.type || 'all');

      return {
        title: `Search Results for "${query.q}"`,
        generatedAt: new Date().toISOString(),
        query: query.q,
        type: query.type || 'all',
        totalResults: results.length,
        results
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to search documentation',
        details: (error as Error).message 
      });
    }
  });

  // ── GET /docs/export — Export all documentation as structured data ──
  app.get('/docs/export', async (request, reply) => {
    const query = request.query as {
      format?: 'json' | 'markdown';
      sections?: string; // comma-separated list
    };

    try {
      const { exportDocumentation } = await import('./export.js');
      const exported = await exportDocumentation({
        format: query.format || 'json',
        sections: query.sections ? query.sections.split(',') : undefined
      });

      if (query.format === 'markdown') {
        reply
          .header('Content-Type', 'text/markdown')
          .header('Content-Disposition', 'attachment; filename="ai-optimization-docs.md"');
      }

      return exported;
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to export documentation',
        details: (error as Error).message 
      });
    }
  });

  // ── GET /docs/stats — Documentation statistics and health metrics ──
  app.get('/docs/stats', async (request, reply) => {
    try {
      const { generateDocumentationStats } = await import('./stats.js');
      const stats = await generateDocumentationStats();

      return {
        title: 'Documentation System Statistics',
        generatedAt: new Date().toISOString(),
        ...stats
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to generate documentation statistics',
        details: (error as Error).message 
      });
    }
  });
}

// Export documentation generation functions for programmatic use
export { 
  generateOptimizationStrategiesDoc,
  generatePageSpeedAuditsDoc,
  generateLearningHistoryDoc,
  generateSystemOverviewDoc
};

// Documentation interfaces
export interface DocumentationSection {
  id: string;
  title: string;
  description: string;
  content: unknown;
  lastUpdated: Date;
  tags: string[];
}

export interface SearchResult {
  section: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  url: string;
}

export interface DocumentationStats {
  totalSections: number;
  totalOptimizationStrategies: number;
  totalPageSpeedAudits: number;
  mappedAudits: number;
  unmappedAudits: number;
  totalLearningPatterns: number;
  lastUpdate: Date;
  systemHealth: 'healthy' | 'warning' | 'error';
}