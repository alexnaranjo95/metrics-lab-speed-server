import { FastifyInstance } from 'fastify';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  sites,
  performanceComparisons,
  performanceMonitors,
  alertRules,
  alertLog,
} from '../db/schema.js';
import { requireMasterKey } from '../middleware/auth.js';
import { calculateBusinessImpact } from '../services/pagespeed.js';
import { monitorQueue } from '../queue/monitorQueue.js';
import { buildEmitter } from '../events/buildEmitter.js';
import { nanoid } from 'nanoid';

// ─── Helper: format comparison row for API response ───────────────

function formatComparison(row: typeof performanceComparisons.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    buildId: row.buildId,
    testedAt: row.testedAt?.toISOString(),
    strategy: row.strategy,
    originalDomain: row.originalDomain,
    optimizedDomain: row.optimizedDomain,
    original: {
      performance: row.originalPerformanceScore ?? 0,
      lcp: row.originalLcpMs ?? 0,
      tbt: row.originalTbtMs ?? 0,
      cls: row.originalCls ?? 0,
      fcp: row.originalFcpMs ?? 0,
      si: row.originalSiMs ?? 0,
      ttfb: row.originalTtfbMs ?? 0,
    },
    optimized: {
      performance: row.optimizedPerformanceScore ?? 0,
      lcp: row.optimizedLcpMs ?? 0,
      tbt: row.optimizedTbtMs ?? 0,
      cls: row.optimizedCls ?? 0,
      fcp: row.optimizedFcpMs ?? 0,
      si: row.optimizedSiMs ?? 0,
      ttfb: row.optimizedTtfbMs ?? 0,
    },
    improvements: {
      score: row.scoreImprovement ?? 0,
      lcp: row.lcpImprovement ?? 0,
      tbt: row.tbtImprovement ?? 0,
      cls: row.clsImprovement ?? 0,
      fcp: row.fcpImprovement ?? 0,
      si: row.siImprovement ?? 0,
    },
    payloadSavings: {
      totalKb: row.totalPayloadReductionKb,
      imageKb: row.imageOptimizationSavingsKb,
      jsKb: row.jsOptimizationSavingsKb,
      cssKb: row.cssOptimizationSavingsKb,
    },
    fieldDataOriginal: row.fieldDataOriginal,
    fieldDataOptimized: row.fieldDataOptimized,
    opportunitiesOriginal: row.opportunitiesOriginal ?? [],
    opportunitiesOptimized: row.opportunitiesOptimized ?? [],
  };
}

// ─── Routes ───────────────────────────────────────────────────────

export async function performanceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireMasterKey);

  // ── GET /comparison — Latest comparison (mobile + desktop) ──
  app.get('/sites/:siteId/performance/comparison', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    const rows = await db.query.performanceComparisons.findMany({
      where: eq(performanceComparisons.siteId, siteId),
      orderBy: [desc(performanceComparisons.testedAt)],
      limit: 2, // latest mobile + desktop
    });

    // Group by strategy (return the most recent of each)
    const mobile = rows.find(r => r.strategy === 'mobile');
    const desktop = rows.find(r => r.strategy === 'desktop');

    return {
      mobile: mobile ? formatComparison(mobile) : null,
      desktop: desktop ? formatComparison(desktop) : null,
    };
  });

  // ── GET /comparison/history — Paginated history ──
  app.get('/sites/:siteId/performance/comparison/history', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const query = request.query as {
      strategy?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(parseInt(query.limit || '50', 10), 200);
    const offset = parseInt(query.offset || '0', 10);

    const conditions = [eq(performanceComparisons.siteId, siteId)];
    if (query.strategy && (query.strategy === 'mobile' || query.strategy === 'desktop')) {
      conditions.push(eq(performanceComparisons.strategy, query.strategy));
    }
    if (query.from) {
      conditions.push(gte(performanceComparisons.testedAt, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lte(performanceComparisons.testedAt, new Date(query.to)));
    }

    const rows = await db.query.performanceComparisons.findMany({
      where: and(...conditions),
      orderBy: [desc(performanceComparisons.testedAt)],
      limit,
      offset,
    });

    return {
      comparisons: rows.map(formatComparison),
      total: rows.length,
      limit,
      offset,
    };
  });

  // ── GET /metrics/timeseries — Time-series data for charts ──
  app.get('/sites/:siteId/performance/metrics/timeseries', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const query = request.query as {
      strategy?: string;
      days?: string;
    };

    const strategy = query.strategy || 'mobile';
    const days = Math.min(parseInt(query.days || '30', 10), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await db.query.performanceComparisons.findMany({
      where: and(
        eq(performanceComparisons.siteId, siteId),
        eq(performanceComparisons.strategy, strategy),
        gte(performanceComparisons.testedAt, since)
      ),
      orderBy: [performanceComparisons.testedAt],
    });

    return {
      strategy,
      days,
      dataPoints: rows.map(r => ({
        testedAt: r.testedAt?.toISOString(),
        originalScore: r.originalPerformanceScore,
        optimizedScore: r.optimizedPerformanceScore,
        originalLcp: r.originalLcpMs,
        optimizedLcp: r.optimizedLcpMs,
        originalFcp: r.originalFcpMs,
        optimizedFcp: r.optimizedFcpMs,
        originalSi: r.originalSiMs,
        optimizedSi: r.optimizedSiMs,
        originalTbt: r.originalTbtMs,
        optimizedTbt: r.optimizedTbtMs,
        originalCls: r.originalCls,
        optimizedCls: r.optimizedCls,
      })),
    };
  });

  // ── POST /test — Trigger an on-demand comparison test ──
  app.post('/sites/:siteId/performance/test', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) return reply.status(404).send({ error: 'Site not found' });
    if (!site.edgeUrl) return reply.status(400).send({ error: 'Site has no edge URL — run a build first' });

    const testId = `test_${nanoid(12)}`;

    // Queue the job
    await monitorQueue.add(
      `on-demand-${testId}`,
      { type: 'on_demand', siteId, testId },
      { jobId: testId }
    );

    return { testId, status: 'queued', message: 'Performance test queued' };
  });

  // ── GET /test/:testId — Poll test status ──
  app.get('/sites/:siteId/performance/test/:testId', async (request, reply) => {
    const { testId } = request.params as { siteId: string; testId: string };

    const job = await monitorQueue.getJob(testId);
    if (!job) return reply.status(404).send({ error: 'Test not found' });

    const state = await job.getState();

    return {
      testId,
      status: state,
      progress: job.progress,
    };
  });

  // ── GET /business-impact — Calculate business impact ──
  app.get('/sites/:siteId/performance/business-impact', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    const latest = await db.query.performanceComparisons.findFirst({
      where: and(
        eq(performanceComparisons.siteId, siteId),
        eq(performanceComparisons.strategy, 'mobile')
      ),
      orderBy: [desc(performanceComparisons.testedAt)],
    });

    if (!latest) return reply.status(404).send({ error: 'No comparison data found' });

    const impact = calculateBusinessImpact(
      latest.originalPerformanceScore ?? 0,
      latest.optimizedPerformanceScore ?? 0,
      latest.originalLcpMs ?? 0,
      latest.optimizedLcpMs ?? 0
    );

    return { impact, comparison: formatComparison(latest) };
  });

  // ── GET /report — Full report JSON ──
  app.get('/sites/:siteId/performance/report', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) return reply.status(404).send({ error: 'Site not found' });

    // Get latest comparisons
    const latestRows = await db.query.performanceComparisons.findMany({
      where: eq(performanceComparisons.siteId, siteId),
      orderBy: [desc(performanceComparisons.testedAt)],
      limit: 2,
    });

    const mobile = latestRows.find(r => r.strategy === 'mobile');
    const desktop = latestRows.find(r => r.strategy === 'desktop');

    // Get trend data (last 30 days)
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const trends = await db.query.performanceComparisons.findMany({
      where: and(
        eq(performanceComparisons.siteId, siteId),
        eq(performanceComparisons.strategy, 'mobile'),
        gte(performanceComparisons.testedAt, since)
      ),
      orderBy: [performanceComparisons.testedAt],
    });

    // Business impact
    const impact = mobile ? calculateBusinessImpact(
      mobile.originalPerformanceScore ?? 0,
      mobile.optimizedPerformanceScore ?? 0,
      mobile.originalLcpMs ?? 0,
      mobile.optimizedLcpMs ?? 0
    ) : null;

    return {
      site: {
        id: site.id,
        name: site.name,
        siteUrl: site.siteUrl,
        edgeUrl: site.edgeUrl,
      },
      generatedAt: new Date().toISOString(),
      mobile: mobile ? formatComparison(mobile) : null,
      desktop: desktop ? formatComparison(desktop) : null,
      trends: trends.map(r => ({
        testedAt: r.testedAt?.toISOString(),
        originalScore: r.originalPerformanceScore,
        optimizedScore: r.optimizedPerformanceScore,
      })),
      businessImpact: impact,
    };
  });

  // ── GET /export/csv — CSV export ──
  app.get('/sites/:siteId/performance/export/csv', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const query = request.query as { strategy?: string; days?: string };

    const days = parseInt(query.days || '90', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const conditions = [
      eq(performanceComparisons.siteId, siteId),
      gte(performanceComparisons.testedAt, since),
    ];
    if (query.strategy) {
      conditions.push(eq(performanceComparisons.strategy, query.strategy));
    }

    const rows = await db.query.performanceComparisons.findMany({
      where: and(...conditions),
      orderBy: [desc(performanceComparisons.testedAt)],
    });

    const header = 'Date,Strategy,Original Score,Optimized Score,Score Improvement %,Original LCP (ms),Optimized LCP (ms),LCP Improvement %,Original TBT (ms),Optimized TBT (ms),TBT Improvement %,Original CLS,Optimized CLS,CLS Improvement %,Original FCP (ms),Optimized FCP (ms),FCP Improvement %,Original SI (ms),Optimized SI (ms),SI Improvement %';
    const csvRows = rows.map(r =>
      [
        r.testedAt?.toISOString(),
        r.strategy,
        r.originalPerformanceScore, r.optimizedPerformanceScore, r.scoreImprovement,
        r.originalLcpMs, r.optimizedLcpMs, r.lcpImprovement,
        r.originalTbtMs, r.optimizedTbtMs, r.tbtImprovement,
        r.originalCls, r.optimizedCls, r.clsImprovement,
        r.originalFcpMs, r.optimizedFcpMs, r.fcpImprovement,
        r.originalSiMs, r.optimizedSiMs, r.siImprovement,
      ].join(',')
    );

    const csv = [header, ...csvRows].join('\n');

    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="performance-${siteId}-${days}d.csv"`)
      .send(csv);
  });

  // ── GET /export/json — JSON export ──
  app.get('/sites/:siteId/performance/export/json', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const query = request.query as { strategy?: string; days?: string };

    const days = parseInt(query.days || '90', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const conditions = [
      eq(performanceComparisons.siteId, siteId),
      gte(performanceComparisons.testedAt, since),
    ];
    if (query.strategy) {
      conditions.push(eq(performanceComparisons.strategy, query.strategy));
    }

    const rows = await db.query.performanceComparisons.findMany({
      where: and(...conditions),
      orderBy: [desc(performanceComparisons.testedAt)],
    });

    return { comparisons: rows.map(formatComparison), exported: rows.length };
  });

  // ── Monitoring Config ───────────────────────────────────────────

  // GET /monitor
  app.get('/sites/:siteId/performance/monitor', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    const monitor = await db.query.performanceMonitors.findFirst({
      where: eq(performanceMonitors.siteId, siteId),
    });

    return { monitor: monitor ?? null };
  });

  // PUT /monitor
  app.put('/sites/:siteId/performance/monitor', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const body = request.body as {
      frequency?: string;
      enabled?: boolean;
      alertOnRegression?: boolean;
      regressionThreshold?: number;
    };

    const existing = await db.query.performanceMonitors.findFirst({
      where: eq(performanceMonitors.siteId, siteId),
    });

    if (existing) {
      const updates: Record<string, any> = {};
      if (body.frequency !== undefined) updates.frequency = body.frequency;
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      if (body.alertOnRegression !== undefined) updates.alertOnRegression = body.alertOnRegression;
      if (body.regressionThreshold !== undefined) updates.regressionThreshold = body.regressionThreshold;

      if (body.frequency) {
        const now = new Date();
        updates.nextRunAt = new Date(now.getTime() + getFrequencyMs(body.frequency));
      }

      await db.update(performanceMonitors).set(updates).where(eq(performanceMonitors.id, existing.id));
      const updated = await db.query.performanceMonitors.findFirst({ where: eq(performanceMonitors.id, existing.id) });
      return { monitor: updated };
    } else {
      const id = `pm_${nanoid(12)}`;
      const freq = body.frequency || 'daily';
      await db.insert(performanceMonitors).values({
        id,
        siteId,
        frequency: freq,
        enabled: body.enabled ?? true,
        alertOnRegression: body.alertOnRegression ?? true,
        regressionThreshold: body.regressionThreshold ?? -10,
        nextRunAt: new Date(Date.now() + getFrequencyMs(freq)),
      });
      const created = await db.query.performanceMonitors.findFirst({ where: eq(performanceMonitors.id, id) });
      return { monitor: created };
    }
  });

  // ── Alert Rules CRUD ────────────────────────────────────────────

  // GET /alerts
  app.get('/sites/:siteId/performance/alerts', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const rules = await db.query.alertRules.findMany({
      where: eq(alertRules.siteId, siteId),
      orderBy: [desc(alertRules.createdAt)],
    });
    return { rules };
  });

  // POST /alerts
  app.post('/sites/:siteId/performance/alerts', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const body = request.body as {
      metric: string;
      condition: string;
      value: number;
      timeWindow?: string;
      severity?: string;
      channels?: string[];
      webhookUrl?: string;
      slackWebhookUrl?: string;
    };

    const id = `ar_${nanoid(12)}`;
    await db.insert(alertRules).values({
      id,
      siteId,
      metric: body.metric,
      condition: body.condition,
      value: body.value,
      timeWindow: body.timeWindow ?? '24h',
      severity: body.severity ?? 'warning',
      channels: body.channels ?? [],
      webhookUrl: body.webhookUrl ?? null,
      slackWebhookUrl: body.slackWebhookUrl ?? null,
    });

    const rule = await db.query.alertRules.findFirst({ where: eq(alertRules.id, id) });
    return { rule };
  });

  // PUT /alerts/:ruleId
  app.put('/sites/:siteId/performance/alerts/:ruleId', async (request, reply) => {
    const { ruleId } = request.params as { siteId: string; ruleId: string };
    const body = request.body as Record<string, any>;

    const allowed = ['metric', 'condition', 'value', 'timeWindow', 'severity', 'channels', 'enabled', 'webhookUrl', 'slackWebhookUrl'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    await db.update(alertRules).set(updates).where(eq(alertRules.id, ruleId));
    const updated = await db.query.alertRules.findFirst({ where: eq(alertRules.id, ruleId) });
    return { rule: updated };
  });

  // DELETE /alerts/:ruleId
  app.delete('/sites/:siteId/performance/alerts/:ruleId', async (request, reply) => {
    const { ruleId } = request.params as { siteId: string; ruleId: string };
    await db.delete(alertRules).where(eq(alertRules.id, ruleId));
    return { deleted: true };
  });

  // GET /alerts/log
  app.get('/sites/:siteId/performance/alerts/log', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };
    const query = request.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit || '50', 10), 200);

    const logs = await db.query.alertLog.findMany({
      where: eq(alertLog.siteId, siteId),
      orderBy: [desc(alertLog.createdAt)],
      limit,
    });
    return { logs };
  });

  // ── SSE Stream ──────────────────────────────────────────────────

  app.get('/sites/:siteId/performance/stream', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const onStarted = (data: any) => {
      reply.raw.write(`event: started\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onProgress = (data: any) => {
      reply.raw.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onComplete = (data: any) => {
      reply.raw.write(`event: complete\ndata: ${JSON.stringify(data)}\n\n`);
    };

    buildEmitter.on(`perf:${siteId}:started`, onStarted);
    buildEmitter.on(`perf:${siteId}:progress`, onProgress);
    buildEmitter.on(`perf:${siteId}:complete`, onComplete);

    // Keepalive ping
    const keepalive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(keepalive);
      buildEmitter.off(`perf:${siteId}:started`, onStarted);
      buildEmitter.off(`perf:${siteId}:progress`, onProgress);
      buildEmitter.off(`perf:${siteId}:complete`, onComplete);
    });
  });
}

// ─── Helper ───────────────────────────────────────────────────────

function getFrequencyMs(freq: string): number {
  switch (freq) {
    case 'hourly': return 60 * 60 * 1000;
    case 'daily': return 24 * 60 * 60 * 1000;
    case 'weekly': return 7 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}
