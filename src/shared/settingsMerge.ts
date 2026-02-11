import { Redis } from 'ioredis';
import { APP_DEFAULTS, settingsSchema } from './settingsSchema.js';
import type { OptimizationSettings, SettingsOverride } from './settingsSchema.js';
import { config } from '../config.js';

// ─── Redis Settings Cache ─────────────────────────────────────────

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = 'settings:';

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
    _redis.connect().catch(() => {
      // Non-fatal — cache miss falls through to DB
    });
  }
  return _redis;
}

/**
 * Get resolved settings from cache, or resolve from data and cache the result.
 */
export async function getCachedResolvedSettings(
  siteId: string,
  siteSettings: SettingsOverride | null | undefined,
  assetOverrideSettings?: SettingsOverride[]
): Promise<OptimizationSettings> {
  try {
    const redis = getRedis();
    const cached = await redis.get(`${CACHE_PREFIX}${siteId}`);
    if (cached) return JSON.parse(cached);
  } catch {
    // Cache miss — resolve from data
  }

  const resolved = resolveSettingsFromData(siteSettings, assetOverrideSettings);

  try {
    const redis = getRedis();
    await redis.setex(`${CACHE_PREFIX}${siteId}`, CACHE_TTL, JSON.stringify(resolved));
  } catch {
    // Non-fatal
  }

  return resolved;
}

/**
 * Invalidate the cached settings for a site.
 */
export async function invalidateSettingsCache(siteId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${CACHE_PREFIX}${siteId}`);
  } catch {
    // Non-fatal
  }
}

/**
 * Deep merge two objects. Override keys win. Arrays are replaced, not concatenated.
 * Only plain objects are recursively merged; everything else is replaced.
 */
export function deepMerge(
  base: Record<string, any>,
  override: Record<string, any> | null | undefined
): Record<string, any> {
  if (!override || Object.keys(override).length === 0) return base;

  const result = { ...base };

  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];

    if (overrideVal === undefined) continue;

    if (
      baseVal !== null &&
      overrideVal !== null &&
      typeof baseVal === 'object' &&
      typeof overrideVal === 'object' &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(baseVal, overrideVal);
    } else {
      result[key] = overrideVal;
    }
  }

  return result;
}

/**
 * Resolve settings for a site by merging: APP_DEFAULTS → site.settings → asset overrides.
 * This function operates on raw data (no DB access) to keep it pure and testable.
 */
export function resolveSettingsFromData(
  siteSettings: SettingsOverride | null | undefined,
  assetOverrideSettings?: SettingsOverride[]
): OptimizationSettings {
  let resolved = deepMerge(APP_DEFAULTS as Record<string, any>, siteSettings as Record<string, any> ?? {});

  if (assetOverrideSettings) {
    for (const override of assetOverrideSettings) {
      resolved = deepMerge(resolved, override as Record<string, any>);
    }
  }

  // Validate with Zod to ensure all defaults are filled in
  return settingsSchema.parse(resolved);
}

/**
 * Compute the diff between stored overrides and defaults.
 * Returns an object with the same shape, where each leaf is `true` if overridden.
 */
export function diffSettings(
  stored: SettingsOverride | null | undefined,
  defaults: OptimizationSettings = APP_DEFAULTS
): Record<string, any> {
  if (!stored || Object.keys(stored).length === 0) return {};

  return buildDiff(defaults, stored);
}

function buildDiff(defaults: Record<string, any>, stored: Record<string, any>): Record<string, any> {
  const diff: Record<string, any> = {};

  for (const key of Object.keys(stored)) {
    const storedVal = stored[key];
    const defaultVal = defaults?.[key];

    if (storedVal === undefined) continue;

    if (
      storedVal !== null &&
      defaultVal !== null &&
      typeof storedVal === 'object' &&
      typeof defaultVal === 'object' &&
      !Array.isArray(storedVal) &&
      !Array.isArray(defaultVal)
    ) {
      const nested = buildDiff(defaultVal, storedVal);
      if (Object.keys(nested).length > 0) {
        diff[key] = nested;
      }
    } else {
      // Leaf value — mark as overridden if different
      if (JSON.stringify(storedVal) !== JSON.stringify(defaultVal)) {
        diff[key] = true;
      }
    }
  }

  return diff;
}

/**
 * Check if a URL matches a glob-like pattern.
 * Supports * and ** wildcards.
 */
export function matchUrlPattern(url: string, pattern: string): boolean {
  // Convert glob to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*');

  return new RegExp(`^${regexStr}$`).test(url);
}
