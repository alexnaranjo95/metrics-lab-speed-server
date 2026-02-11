import 'dotenv/config';

function requireEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

function intEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

export const config = {
  // Server
  PORT: intEnv('PORT', 3002),
  NODE_ENV: optionalEnv('NODE_ENV', 'development') as string,
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info') as string,

  // Database
  DATABASE_URL: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/metrics_lab_speed'),

  // Redis
  REDIS_HOST: optionalEnv('REDIS_HOST', 'localhost') as string,
  REDIS_PORT: intEnv('REDIS_PORT', 6379),
  REDIS_PASSWORD: optionalEnv('REDIS_PASSWORD'),

  // Authentication (accept both MASTER_API_KEY and SPEED_BUILD_SERVER_MASTER_KEY for Coolify compat)
  MASTER_API_KEY: requireEnv('MASTER_API_KEY',
    process.env.SPEED_BUILD_SERVER_MASTER_KEY ?? 'dev_master_key_change_in_production'
  ),

  // AI (Claude)
  ANTHROPIC_API_KEY: optionalEnv('ANTHROPIC_API_KEY') as string | undefined,

  // Cloudflare
  CLOUDFLARE_ACCOUNT_ID: optionalEnv('CLOUDFLARE_ACCOUNT_ID'),
  CLOUDFLARE_API_TOKEN: optionalEnv('CLOUDFLARE_API_TOKEN'),

  // Dashboard
  DASHBOARD_WEBHOOK_URL: optionalEnv('DASHBOARD_WEBHOOK_URL'),

  // Build limits
  MAX_PAGES_PER_SITE: intEnv('MAX_PAGES_PER_SITE', 500),
  MAX_CONCURRENT_BUILDS: intEnv('MAX_CONCURRENT_BUILDS', 2),
  BUILD_TIMEOUT_MINUTES: intEnv('BUILD_TIMEOUT_MINUTES', 30),
} as const;
