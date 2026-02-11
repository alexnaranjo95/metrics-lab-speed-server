import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { siteRoutes } from './api/sites.js';
import { buildRoutes } from './api/builds.js';
import { webhookRoutes } from './api/webhooks.js';
import { settingsRoutes } from './api/settings.js';
import { websocketRoutes } from './api/websocket.js';
import { buildLogRoutes } from './api/buildLogs.js';
import { buildWorker } from './queue/buildWorker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Validate all required optimizer modules are installed.
 * If any are missing, log FATAL and exit so the container shows as unhealthy.
 */
async function validateDependencies() {
  const REQUIRED_MODULES = [
    'cheerio',
    'html-minifier-terser',
    'svgo',
    'sharp',
    'purgecss',
    'clean-css',
    'terser',
  ];

  const missing: string[] = [];
  for (const mod of REQUIRED_MODULES) {
    try {
      await import(mod);
    } catch {
      missing.push(mod);
    }
  }

  if (missing.length > 0) {
    console.error(`FATAL: Missing optimizer dependencies: ${missing.join(', ')}`);
    console.error('Add them to package.json and rebuild the Docker image.');
    process.exit(1);
  }

  console.log(`Dependency validation passed (${REQUIRED_MODULES.length} modules OK)`);
}

async function start() {
  // Validate optimizer dependencies before anything else
  await validateDependencies();

  // Run database migrations
  try {
    await runMigrations();
  } catch (err) {
    console.error('Migration failed (continuing):', (err as Error).message);
  }

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
    },
  });

  // CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // WebSocket support
  await app.register(websocket);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Serve React SPA in production
  const clientDistPath = path.join(__dirname, '../client/dist');
  if (config.NODE_ENV === 'production') {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      wildcard: false,
      maxAge: '1y',
      immutable: true,
    });
  }

  // Register API routes
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(siteRoutes, { prefix: '/api' });
  await app.register(buildRoutes, { prefix: '/api' });
  await app.register(buildLogRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(websocketRoutes);

  // SPA fallback: serve index.html for all non-API routes in production
  if (config.NODE_ENV === 'production') {
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws/') || req.url.startsWith('/webhooks/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // Start server
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Server listening on port ${config.PORT}`);

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...');
    await buildWorker.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
