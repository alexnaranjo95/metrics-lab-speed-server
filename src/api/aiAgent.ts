import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites } from '../db/schema.js';
import { requireMasterKey } from '../middleware/auth.js';
import { agentQueue } from '../queue/agentQueue.js';
import { getAgentState, stopAgent } from '../ai/agent.js';
import { isClaudeAvailable } from '../ai/claude.js';
import { config } from '../config.js';
import { buildEmitter } from '../events/buildEmitter.js';

export const aiAgentRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST: Start AI optimization agent ──────────────────────────
  app.post<{ Params: { siteId: string } }>(
    '/sites/:siteId/ai/optimize',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;

      if (!isClaudeAvailable()) {
        // Debug: log what env vars are visible to help diagnose Coolify config
        const anthropicEnvKeys = Object.keys(process.env).filter(k => k.toLowerCase().includes('anthrop') || k.toLowerCase().includes('claude') || k.toLowerCase().includes('api_key'));
        console.error(`[AI_DEBUG] ANTHROPIC_API_KEY not found. config.ANTHROPIC_API_KEY=${config.ANTHROPIC_API_KEY === undefined ? 'undefined' : 'empty-string'}. process.env.ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY === undefined ? 'undefined' : `set(len=${process.env.ANTHROPIC_API_KEY.length})`}. Related env keys: ${JSON.stringify(anthropicEnvKeys)}`);
        return reply.code(400).send({ 
          error: 'ANTHROPIC_API_KEY not configured. Set it in environment variables.',
          debug: {
            configHasKey: config.ANTHROPIC_API_KEY !== undefined,
            envHasKey: process.env.ANTHROPIC_API_KEY !== undefined,
            relatedEnvKeys: anthropicEnvKeys,
          }
        });
      }

      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!site) return reply.code(404).send({ error: 'Site not found' });

      // Check if agent is already running for this site
      const existing = getAgentState(siteId);
      if (existing && existing.phase !== 'complete' && existing.phase !== 'failed') {
        return reply.code(409).send({ error: 'Agent already running for this site', runId: existing.runId, phase: existing.phase });
      }

      // Enqueue the agent job
      const job = await agentQueue.add('optimize', { siteId }, { jobId: `agent_${siteId}_${Date.now()}` });

      return reply.code(202).send({
        message: 'AI optimization agent started',
        jobId: job.id,
        siteId,
      });
    }
  );

  // ─── GET: Agent status ──────────────────────────────────────────
  app.get<{ Params: { siteId: string } }>(
    '/sites/:siteId/ai/status',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const state = getAgentState(siteId);

      if (!state) {
        return reply.send({ running: false, phase: null, iteration: 0, logs: [] });
      }

      return reply.send({
        running: state.phase !== 'complete' && state.phase !== 'failed',
        runId: state.runId,
        phase: state.phase,
        iteration: state.iteration,
        maxIterations: state.maxIterations,
        logCount: state.logs.length,
        recentLogs: state.logs.slice(-50),
      });
    }
  );

  // ─── GET: Agent report ──────────────────────────────────────────
  app.get<{ Params: { siteId: string } }>(
    '/sites/:siteId/ai/report',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const state = getAgentState(siteId);

      if (!state || !state.report) {
        return reply.code(404).send({ error: 'No agent report available' });
      }

      return reply.send({ report: state.report });
    }
  );

  // ─── POST: Stop agent ───────────────────────────────────────────
  app.post<{ Params: { siteId: string } }>(
    '/sites/:siteId/ai/stop',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const stopped = stopAgent(siteId);
      return reply.send({ stopped });
    }
  );

  // ─── SSE: Stream agent progress ─────────────────────────────────
  app.get<{ Params: { siteId: string } }>(
    '/sites/:siteId/ai/stream',
    async (req, reply) => {
      const { siteId } = req.params;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send existing logs
      const state = getAgentState(siteId);
      if (state) {
        for (const log of state.logs) {
          reply.raw.write(`data: ${JSON.stringify(log)}\n\n`);
        }
        reply.raw.write(`event: phase\ndata: ${JSON.stringify({ phase: state.phase, iteration: state.iteration })}\n\n`);
      }

      // Stream new events
      const onLog = (log: any) => {
        reply.raw.write(`data: ${JSON.stringify(log)}\n\n`);
      };
      const onPhase = (phase: string) => {
        reply.raw.write(`event: phase\ndata: ${JSON.stringify({ phase })}\n\n`);
      };
      const onComplete = (report: any) => {
        reply.raw.write(`event: complete\ndata: ${JSON.stringify(report)}\n\n`);
        cleanup();
        reply.raw.end();
      };

      buildEmitter.on(`agent:${siteId}:log`, onLog);
      buildEmitter.on(`agent:${siteId}:phase`, onPhase);
      buildEmitter.on(`agent:${siteId}:complete`, onComplete);

      const keepAlive = setInterval(() => {
        reply.raw.write(`: keepalive\n\n`);
      }, 15000);

      const cleanup = () => {
        clearInterval(keepAlive);
        buildEmitter.off(`agent:${siteId}:log`, onLog);
        buildEmitter.off(`agent:${siteId}:phase`, onPhase);
        buildEmitter.off(`agent:${siteId}:complete`, onComplete);
      };

      req.raw.on('close', cleanup);
    }
  );
};
