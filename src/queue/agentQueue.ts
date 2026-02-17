import { Queue } from 'bullmq';
import { redisConnectionOptions } from './connection.js';

export interface AgentJobData {
  siteId: string;
  runId?: string;
}

export const agentQueue = new Queue<AgentJobData>('ai-agent', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 20 },
  },
});
