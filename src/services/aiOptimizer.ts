import { Redis } from 'ioredis';
import { config } from '../config.js';

// ─── Cost Calculation ─────────────────────────────────────────

export function calculateCost(inputTokens: number, outputTokens: number): number {
  // Opus 4 pricing: $15/MTok input, $75/MTok output
  return inputTokens * (15 / 1_000_000) + outputTokens * (75 / 1_000_000);
}

// ─── Redis Usage Tracking ─────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      ...(config.REDIS_PASSWORD ? { password: config.REDIS_PASSWORD } : {}),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    _redis.connect().catch(() => {});
  }
  return _redis;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function trackTokenUsage(inputTokens: number, outputTokens: number): Promise<void> {
  try {
    const redis = getRedis();
    const month = currentMonthKey();
    await redis.incrby(`ai:usage:${month}:input`, inputTokens);
    await redis.incrby(`ai:usage:${month}:output`, outputTokens);
    await redis.expire(`ai:usage:${month}:input`, 90 * 86400);
    await redis.expire(`ai:usage:${month}:output`, 90 * 86400);
  } catch {
    // Non-fatal
  }
}

export async function getMonthlyUsage(): Promise<{ inputTokens: number; outputTokens: number; estimatedCost: number }> {
  try {
    const redis = getRedis();
    const month = currentMonthKey();
    const [input, output] = await Promise.all([
      redis.get(`ai:usage:${month}:input`),
      redis.get(`ai:usage:${month}:output`),
    ]);
    const inputTokens = parseInt(input || '0', 10);
    const outputTokens = parseInt(output || '0', 10);
    const estimatedCost = calculateCost(inputTokens, outputTokens);
    return { inputTokens, outputTokens, estimatedCost };
  } catch {
    return { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
  }
}
