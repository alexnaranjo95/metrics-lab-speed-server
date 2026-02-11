import { Worker } from 'bullmq';
import { redisConnectionOptions } from './connection.js';
import { config } from '../config.js';
import { runBuildPipeline } from '../pipeline/index.js';
import type { BuildJobData } from './buildQueue.js';

export const buildWorker = new Worker<BuildJobData>(
  'builds',
  async (job) => {
    const { buildId, siteId, scope, pages } = job.data;
    console.log(`Processing build job ${job.id}: build=${buildId}, site=${siteId}, scope=${scope}`);
    await runBuildPipeline(buildId, siteId, scope, pages);
  },
  {
    connection: redisConnectionOptions,
    concurrency: config.MAX_CONCURRENT_BUILDS,
    lockDuration: 15 * 60 * 1000, // 15 minutes — auto-fail if worker stops heartbeating
    stalledInterval: 2 * 60 * 1000, // Check for stalled jobs every 2 minutes
    limiter: {
      max: 5,
      duration: 60000,
    },
  }
);

buildWorker.on('failed', (job, err) => {
  console.error(`Build job ${job?.id} failed:`, err.message);
});

buildWorker.on('completed', (job) => {
  console.log(`Build job ${job.id} completed`);
});

buildWorker.on('error', (err) => {
  console.error('Build worker error:', err.message);
});
