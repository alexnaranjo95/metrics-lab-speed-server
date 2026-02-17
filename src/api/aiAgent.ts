import fs from 'fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites, agentRuns } from '../db/schema.js';
import { requireMasterKey } from '../middleware/auth.js';
import { agentQueue } from '../queue/agentQueue.js';
import { getAgentState, stopAgent } from '../ai/agent.js';
import { isClaudeAvailable } from '../ai/claude.js';
import { buildEmitter } from '../events/buildEmitter.js';

export const aiAgentRoutes: FastifyPluginAsync = async (app) => {

  // ─── POST: Start AI optimization agent ──────────────────────────
  app.post<{ Params: { siteId: string } }>(
    '/sites/:siteId/ai/optimize',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;

      if (!isClaudeAvailable()) {
        // Include diagnostic info to help debug Coolify env var injection
        const envKeys = Object.keys(process.env).filter(k => 
          k.toLowerCase().includes('anthrop') || k.toLowerCase().includes('claude') || k.toLowerCase().includes('api')
        );
        return reply.code(400).send({ 
          error: 'ANTHROPIC_API_KEY not configured. Set it in Coolify environment variables.',
          hint: `Found ${envKeys.length} related env vars: ${envKeys.join(', ') || 'none'}. Check Coolify service > Environment Variables.`
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

      if (state) {
        let canResume = false;
        let resumableRunId: string | undefined;
        if (state.phase === 'failed') {
          const [failedRun] = await db.select().from(agentRuns)
            .where(and(eq(agentRuns.siteId, siteId), eq(agentRuns.runId, state.runId), eq(agentRuns.status, 'failed')))
            .limit(1);
          if (failedRun?.workDir) {
            try {
              await fs.access(failedRun.workDir);
              canResume = true;
              resumableRunId = state.runId;
            } catch { /* workDir missing */ }
          }
        }
        return reply.send({
          running: state.phase !== 'complete' && state.phase !== 'failed',
          runId: state.runId,
          domain: state.domain,
          startedAt: state.startedAt,
          phase: state.phase,
          iteration: state.iteration,
          maxIterations: state.maxIterations,
          phaseTimings: state.phaseTimings,
          lastError: state.lastError,
          logCount: state.logs.length,
          recentLogs: state.logs.slice(-50),
          currentBuildId: state.currentBuildId,
          canResume,
          resumableRunId,
        });
      }

      const [failedRun] = await db.select().from(agentRuns)
        .where(and(eq(agentRuns.siteId, siteId), eq(agentRuns.status, 'failed')))
        .orderBy(desc(agentRuns.updatedAt))
        .limit(1);

      let canResume = false;
      let resumableRunId: string | undefined;
      if (failedRun?.workDir) {
        try {
          await fs.access(failedRun.workDir);
          canResume = true;
          resumableRunId = failedRun.runId;
        } catch { /* workDir missing */ }
      }

      return reply.send({
        running: false,
        phase: 'failed',
        iteration: 0,
        logs: [],
        recentLogs: (failedRun?.checkpoint as any)?.logs?.slice(-50) || [],
        lastError: failedRun?.lastError,
        canResume,
        resumableRunId,
      });
    }
  );

  // ─── POST: Resume failed agent run ───────────────────────────────
  app.post<{ Params: { siteId: string }; Body?: { runId?: string } }>(
    '/sites/:siteId/ai/resume',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const runId = req.body?.runId;

      if (!isClaudeAvailable()) {
        return reply.code(400).send({ error: 'ANTHROPIC_API_KEY not configured' });
      }

      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!site) return reply.code(404).send({ error: 'Site not found' });

      const existing = getAgentState(siteId);
      if (existing && existing.phase !== 'complete' && existing.phase !== 'failed') {
        return reply.code(409).send({ error: 'Agent already running for this site' });
      }

      let targetRunId = runId;
      if (!targetRunId) {
        const [failedRun] = await db.select().from(agentRuns)
          .where(and(eq(agentRuns.siteId, siteId), eq(agentRuns.status, 'failed')))
          .orderBy(desc(agentRuns.updatedAt))
          .limit(1);
        if (!failedRun) return reply.code(404).send({ error: 'No resumable run found' });
        targetRunId = failedRun.runId;
      }

      const job = await agentQueue.add('resume', { siteId, runId: targetRunId }, { jobId: `agent_resume_${siteId}_${Date.now()}` });

      return reply.code(202).send({
        message: 'AI optimization agent resume started',
        jobId: job.id,
        siteId,
        runId: targetRunId,
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
