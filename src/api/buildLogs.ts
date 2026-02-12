import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { builds } from '../db/schema.js';
import { buildEmitter } from '../events/buildEmitter.js';
import type { BuildLogEvent } from '../events/buildEmitter.js';
import { config } from '../config.js';

/**
 * SSE endpoint for streaming build logs in real-time.
 * Sends existing logs first, then streams new events as they arrive.
 * Auth: Bearer header or ?token= query param (EventSource cannot send headers).
 */
export const buildLogRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { buildId: string }; Querystring: { token?: string } }>(
    '/builds/:buildId/logs',
    async (req, reply) => {
      const { buildId } = req.params;
      const authHeader = req.headers.authorization;
      const tokenParam = (req.query as { token?: string }).token;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenParam;
      if (config.MASTER_API_KEY && token !== config.MASTER_API_KEY) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      // Verify build exists
      const build = await db.query.builds.findFirst({
        where: eq(builds.id, buildId),
      });
      if (!build) {
        return reply.code(404).send({ error: 'Build not found' });
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Send existing logs first
      if (build.buildLog && Array.isArray(build.buildLog)) {
        for (const log of build.buildLog) {
          reply.raw.write(`data: ${JSON.stringify(log)}\n\n`);
        }
      }

      // If build is already completed, send the complete event and close
      if (build.status === 'success' || build.status === 'failed') {
        reply.raw.write(`event: complete\ndata: ${JSON.stringify({ status: build.status })}\n\n`);
        reply.raw.end();
        return;
      }

      // Stream new progress events
      const onProgress = (event: BuildLogEvent) => {
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
      };

      // Stream phase changes
      const onPhase = (phase: string) => {
        reply.raw.write(`event: phase\ndata: ${JSON.stringify({ phase })}\n\n`);
      };

      // Stream build completion
      const onComplete = (data: { success: boolean; error?: string }) => {
        reply.raw.write(`event: complete\ndata: ${JSON.stringify(data)}\n\n`);
        cleanup();
        reply.raw.end();
      };

      buildEmitter.on(`build:${buildId}:progress`, onProgress);
      buildEmitter.on(`build:${buildId}:phase`, onPhase);
      buildEmitter.on(`build:${buildId}:complete`, onComplete);

      // Keep-alive ping every 15 seconds
      const keepAlive = setInterval(() => {
        reply.raw.write(`: keepalive\n\n`);
      }, 15000);

      const cleanup = () => {
        clearInterval(keepAlive);
        buildEmitter.off(`build:${buildId}:progress`, onProgress);
        buildEmitter.off(`build:${buildId}:phase`, onPhase);
        buildEmitter.off(`build:${buildId}:complete`, onComplete);
      };

      // Client disconnect
      req.raw.on('close', cleanup);
    }
  );
};
