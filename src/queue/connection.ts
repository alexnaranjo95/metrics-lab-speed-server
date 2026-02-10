import Redis from 'ioredis';
import { config } from '../config.js';

export const redisConnection = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  maxRetriesPerRequest: null, // Required by BullMQ
});

redisConnection.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

redisConnection.on('connect', () => {
  console.log(`Redis connected at ${config.REDIS_HOST}:${config.REDIS_PORT}`);
});
