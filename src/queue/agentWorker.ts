import { Worker } from 'bullmq';
import { redisConnectionOptions } from './connection.js';
import { runOptimizationAgent } from '../ai/agent.js';
import type { AgentJobData } from './agentQueue.js';

export const agentWorker = new Worker<AgentJobData>(
  'ai-agent',
  async (job) => {
    const { siteId } = job.data;
    console.log(`[ai-agent] Starting optimization agent for site ${siteId}`);
    await runOptimizationAgent(siteId);
  },
  {
    connection: redisConnectionOptions,
    concurrency: 1, // Only one agent at a time
    lockDuration: 30 * 60 * 1000, // 30 minutes
    stalledInterval: 5 * 60 * 1000, // Check every 5 minutes
  }
);

agentWorker.on('failed', (job, err) => {
  console.error(`[ai-agent] Agent job ${job?.id} failed:`, err.message);
});

agentWorker.on('completed', (job) => {
  console.log(`[ai-agent] Agent job ${job.id} completed`);
});

agentWorker.on('error', (err) => {
  console.error('[ai-agent] Worker error:', err.message);
});
