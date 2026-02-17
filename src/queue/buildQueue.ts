import { Queue } from 'bullmq';
import { redisConnectionOptions } from './connection.js';

export interface BuildJobData {
  buildId: string;
  siteId: string;
  scope: 'full' | 'partial' | 'single_page';
  pages?: string[];
}

export const buildQueue = new Queue<BuildJobData>('builds', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
