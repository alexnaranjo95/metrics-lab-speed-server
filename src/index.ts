import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { siteRoutes } from './api/sites.js';
import { buildRoutes } from './api/builds.js';
import { webhookRoutes } from './api/webhooks.js';
import { buildWorker } from './queue/buildWorker.js';

async function start() {
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

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Register routes
  await app.register(siteRoutes, { prefix: '/api' });
  await app.register(buildRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });

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
