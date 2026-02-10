import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites, builds } from '../db/schema.js';
import { requireMasterKey } from '../middleware/auth.js';
import { buildQueue } from '../queue/buildQueue.js';

export async function buildRoutes(app: FastifyInstance) {
  // All build routes require master key
  app.addHook('onRequest', requireMasterKey);

  // ── POST /api/sites/:siteId/builds — Trigger a build ──
  app.post('/sites/:siteId/builds', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const body = request.body as {
      scope?: 'full' | 'partial';
      pages?: string[];
    } | null;

    const scope = body?.scope ?? 'full';
    const targetPages = body?.pages;

    // Verify site exists and is active
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
    });

    if (!site) {
      return reply.status(404).send({ error: 'Site not found' });
    }

    if (site.status !== 'active') {
      return reply.status(400).send({ error: `Site is ${site.status}, cannot trigger build` });
    }

    // Check no build is currently in progress
    const inProgress = await db.query.builds.findFirst({
      where: and(
        eq(builds.siteId, siteId),
        inArray(builds.status, ['queued', 'crawling', 'optimizing', 'deploying'])
      ),
    });

    if (inProgress) {
      return reply.status(409).send({
        error: 'Build already in progress',
        buildId: inProgress.id,
      });
    }

    // Create build record
    const buildId = `build_${nanoid(12)}`;
    const [build] = await db.insert(builds).values({
      id: buildId,
      siteId,
      scope,
      triggeredBy: 'api',
      status: 'queued',
    }).returning();

    // Enqueue the build job
    await buildQueue.add('build' as any, {
      buildId: build.id,
      siteId,
      scope,
      pages: targetPages,
    }, {
      jobId: build.id, // Use build ID as job ID for easy lookup
    });

    return reply.status(201).send({
      id: build.id,
      siteId: build.siteId,
      status: build.status,
      scope: build.scope,
      triggeredBy: build.triggeredBy,
      createdAt: build.createdAt,
    });
  });

  // ── GET /api/sites/:siteId/builds/:buildId — Get build details ──
  app.get('/sites/:siteId/builds/:buildId', async (request, reply) => {
    const { siteId, buildId } = request.params as { siteId: string; buildId: string };

    const build = await db.query.builds.findFirst({
      where: and(eq(builds.id, buildId), eq(builds.siteId, siteId)),
    });

    if (!build) {
      return reply.status(404).send({ error: 'Build not found' });
    }

    return {
      id: build.id,
      siteId: build.siteId,
      scope: build.scope,
      triggeredBy: build.triggeredBy,
      status: build.status,
      pagesTotal: build.pagesTotal,
      pagesProcessed: build.pagesProcessed,
      originalSizeBytes: build.originalSizeBytes,
      optimizedSizeBytes: build.optimizedSizeBytes,
      optimization: {
        js: {
          originalBytes: build.jsOriginalBytes,
          optimizedBytes: build.jsOptimizedBytes,
        },
        css: {
          originalBytes: build.cssOriginalBytes,
          optimizedBytes: build.cssOptimizedBytes,
        },
        images: {
          originalBytes: build.imageOriginalBytes,
          optimizedBytes: build.imageOptimizedBytes,
        },
        facadesApplied: build.facadesApplied,
        scriptsRemoved: build.scriptsRemoved,
      },
      performance: {
        lighthouseScoreBefore: build.lighthouseScoreBefore,
        lighthouseScoreAfter: build.lighthouseScoreAfter,
        ttfbBefore: build.ttfbBefore,
        ttfbAfter: build.ttfbAfter,
      },
      errorMessage: build.errorMessage,
      errorDetails: build.errorDetails,
      buildLog: build.buildLog,
      startedAt: build.startedAt,
      completedAt: build.completedAt,
      createdAt: build.createdAt,
    };
  });

  // ── GET /api/sites/:siteId/builds — List builds ──
  app.get('/sites/:siteId/builds', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const query = request.query as { page?: string; limit?: string };

    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    // Verify site exists
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
    });

    if (!site) {
      return reply.status(404).send({ error: 'Site not found' });
    }

    const buildList = await db.query.builds.findMany({
      where: eq(builds.siteId, siteId),
      orderBy: [desc(builds.createdAt)],
      limit,
      offset,
    });

    return {
      builds: buildList.map(b => ({
        id: b.id,
        scope: b.scope,
        triggeredBy: b.triggeredBy,
        status: b.status,
        pagesTotal: b.pagesTotal,
        pagesProcessed: b.pagesProcessed,
        originalSizeBytes: b.originalSizeBytes,
        optimizedSizeBytes: b.optimizedSizeBytes,
        lighthouseScoreBefore: b.lighthouseScoreBefore,
        lighthouseScoreAfter: b.lighthouseScoreAfter,
        errorMessage: b.errorMessage,
        startedAt: b.startedAt,
        completedAt: b.completedAt,
        createdAt: b.createdAt,
      })),
      page,
      limit,
    };
  });
}
