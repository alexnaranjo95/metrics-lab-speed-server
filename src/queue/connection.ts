import { config } from '../config.js';

/**
 * Redis connection OPTIONS (not a shared instance).
 * BullMQ requires separate connections for Queue and Worker,
 * so we export config and let BullMQ create its own connections.
 */
export const redisConnectionOptions: {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
} = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
  maxRetriesPerRequest: null, // Required by BullMQ
};

console.log(`Redis config: ${config.REDIS_HOST}:${config.REDIS_PORT} (password: ${config.REDIS_PASSWORD ? 'yes' : 'no'})`);
