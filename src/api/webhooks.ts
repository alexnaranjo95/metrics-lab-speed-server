import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites, builds } from '../db/schema.js';
import { verifyWebhookSignature } from '../middleware/webhookAuth.js';
import { buildQueue } from '../queue/buildQueue.js';
import type { Site } from '../db/schema.js';

interface WebhookPayload {
  event: 'content_updated' | 'post_published' | 'post_deleted' | 'plugin_activated' | 'theme_changed';
  site_url: string;
  site_id: string;
  timestamp: number;
  data: {
    post_id?: number;
    post_type?: string;
    post_url?: string;
  };
}

// Events that require a full rebuild (affect all pages)
const FULL_BUILD_EVENTS = new Set(['theme_changed', 'plugin_activated']);

export async function webhookRoutes(app: FastifyInstance) {
  // ── POST /webhooks/wordpress — Inbound webhook from WordPress ──
  app.post('/wordpress', {
    preHandler: verifyWebhookSignature,
  }, async (request, reply) => {
    const body = request.body as WebhookPayload;
    const site = (request as any).site as Site;

    if (!body.event) {
      return reply.status(400).send({ error: 'Missing event field' });
    }

    // Check no build is currently in progress
    const inProgress = await db.query.builds.findFirst({
      where: and(
        eq(builds.siteId, site.id),
        inArray(builds.status, ['queued', 'crawling', 'optimizing', 'deploying'])
      ),
    });

    if (inProgress) {
      return reply.status(200).send({
        received: true,
        buildTriggered: false,
        reason: 'Build already in progress',
        buildId: inProgress.id,
      });
    }

    // Determine build scope
    const isFullBuild = FULL_BUILD_EVENTS.has(body.event);
    const scope = isFullBuild ? 'full' : 'partial';
    const targetPages = !isFullBuild && body.data.post_url
      ? [body.data.post_url]
      : undefined;

    // Create build record
    const buildId = `build_${nanoid(12)}`;
    const [build] = await db.insert(builds).values({
      id: buildId,
      siteId: site.id,
      scope,
      triggeredBy: 'webhook',
      status: 'queued',
    }).returning();

    // Enqueue the build job
    await buildQueue.add('build' as any, {
      buildId: build.id,
      siteId: site.id,
      scope,
      pages: targetPages,
    }, {
      jobId: build.id,
    });

    return reply.status(200).send({
      received: true,
      buildTriggered: true,
      buildId: build.id,
      scope,
    });
  });
}
