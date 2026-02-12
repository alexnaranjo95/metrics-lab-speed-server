import { Queue, Worker } from 'bullmq';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { redisConnectionOptions } from './connection.js';
import { db } from '../db/index.js';
import { performanceMonitors, sites, performanceComparisons } from '../db/schema.js';
import { runComparison } from '../services/pagespeed.js';
import { checkAlertRules } from '../services/alertService.js';

// ─── Queue Definition ─────────────────────────────────────────────

export interface MonitorJobData {
  type: 'scheduled_scan' | 'on_demand';
  siteId?: string; // Set for on-demand tests
  testId?: string;
}

export const monitorQueue = new Queue<MonitorJobData>('performance-monitor', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 50 },
  },
});

// ─── Frequency Helper ─────────────────────────────────────────────

function getNextRunAt(frequency: string, from: Date = new Date()): Date {
  const next = new Date(from);
  switch (frequency) {
    case 'hourly':
      next.setHours(next.getHours() + 1);
      break;
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }
  return next;
}

// ─── Worker ───────────────────────────────────────────────────────

export const monitorWorker = new Worker<MonitorJobData>(
  'performance-monitor',
  async (job) => {
    if (job.data.type === 'on_demand' && job.data.siteId) {
      // On-demand single site test
      await runSiteComparison(job.data.siteId);
      return;
    }

    // Scheduled scan: find all monitors due for testing
    const now = new Date();
    const dueMonitors = await db.query.performanceMonitors.findMany({
      where: and(
        eq(performanceMonitors.enabled, true),
        lte(performanceMonitors.nextRunAt, now)
      ),
    });

    console.log(`[monitor] Found ${dueMonitors.length} monitors due for testing`);

    for (const monitor of dueMonitors) {
      try {
        await runSiteComparison(monitor.siteId);

        // Update monitor timestamps
        await db.update(performanceMonitors)
          .set({
            lastRunAt: now,
            nextRunAt: getNextRunAt(monitor.frequency, now),
          })
          .where(eq(performanceMonitors.id, monitor.id));
      } catch (err) {
        console.error(`[monitor] Failed for site ${monitor.siteId}: ${(err as Error).message}`);
      }
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: 1,
    lockDuration: 300000, // 5 minutes
    stalledInterval: 120000,
  }
);

async function runSiteComparison(siteId: string): Promise<void> {
  const site = await db.query.sites.findFirst({
    where: eq(sites.id, siteId),
  });

  if (!site || !site.edgeUrl) {
    console.warn(`[monitor] Site ${siteId} not found or has no edge URL`);
    return;
  }

  console.log(`[monitor] Running comparison for ${site.siteUrl} vs ${site.edgeUrl}`);

  const comparisons = await runComparison(siteId, site.siteUrl, site.edgeUrl);

  // Check alert rules for each comparison
  for (const comparison of comparisons) {
    // Fetch the persisted record for alert checking
    const persisted = await db.query.performanceComparisons.findFirst({
      where: eq(performanceComparisons.id, comparison.id),
    });
    if (persisted) {
      await checkAlertRules(siteId, persisted);
    }
  }
}

// ─── Repeatable Job Setup ─────────────────────────────────────────

/**
 * Set up the repeatable job that scans for due monitors every 30 minutes.
 * Call this once at startup.
 */
export async function setupMonitorSchedule(): Promise<void> {
  // Remove any existing repeatable job, then re-add
  const existingJobs = await monitorQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await monitorQueue.removeRepeatableByKey(job.key);
  }

  await monitorQueue.add(
    'scheduled-scan',
    { type: 'scheduled_scan' },
    {
      repeat: {
        every: 30 * 60 * 1000, // Every 30 minutes
      },
    }
  );

  console.log('[monitor] Scheduled performance monitoring (every 30 min)');
}

monitorWorker.on('failed', (job, err) => {
  console.error(`[monitor] Job ${job?.id} failed: ${err.message}`);
});
