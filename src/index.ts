import fs from 'fs';
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
import { aiAgentRoutes } from './api/aiAgent.js';
import { performanceRoutes } from './api/performance.js';
import { documentationRoutes } from './documentation/index.js';
import { aiLearningRoutes } from './api/aiLearning.js';
import { initializeLearningIntegration, scheduleContinuousLearning } from './ai/learningIntegration.js';
import { buildWorker } from './queue/buildWorker.js';
import { agentWorker } from './queue/agentWorker.js';
import { monitorWorker, setupMonitorSchedule } from './queue/monitorQueue.js';

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

  // Serve React SPA if client/dist exists (works in Docker and local builds)
  // In Docker: CWD=/app, dist/index.js runs → __dirname=/app/dist; client lives at /app/client/dist
  const clientDistPath = fs.existsSync(path.join(process.cwd(), 'client', 'dist'))
    ? path.join(process.cwd(), 'client', 'dist')
    : path.join(__dirname, '../client/dist');
  const clientDistExists = fs.existsSync(path.join(clientDistPath, 'index.html'));

  console.log(`SPA serving: ${clientDistExists ? 'ENABLED' : 'DISABLED (client/dist/index.html not found)'}`);
  console.log(`NODE_ENV: ${config.NODE_ENV}`);
  console.log(`Client dist path: ${clientDistPath}`);
  console.log(`API key configured: ${config.MASTER_API_KEY !== 'dev_master_key_change_in_production' ? 'yes' : 'USING DEFAULT (check env vars!)'}`);
  console.log(`Claude AI integration: ${config.ANTHROPIC_API_KEY ? 'READY' : 'DISABLED (no ANTHROPIC_API_KEY)'}`);

  if (clientDistExists) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      wildcard: false,
      maxAge: '1y',
      immutable: true,
    });
    // Explicitly serve index.html for root (SPA entry)
    app.get('/', async (_, reply) => reply.sendFile('index.html', clientDistPath));
  }

  // Register API routes
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(aiAgentRoutes, { prefix: '/api' });
  await app.register(siteRoutes, { prefix: '/api' });
  await app.register(buildRoutes, { prefix: '/api' });
  await app.register(buildLogRoutes, { prefix: '/api' });
  await app.register(performanceRoutes, { prefix: '/api' });
  await app.register(documentationRoutes, { prefix: '/api' });
  await app.register(aiLearningRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(websocketRoutes);

  // SPA fallback: serve index.html for all non-API, non-WS routes
  if (clientDistExists) {
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/ws/') || req.url.startsWith('/webhooks/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // Set up performance monitoring schedule
  await setupMonitorSchedule().catch(err => {
    console.warn('Monitor schedule setup failed (continuing):', (err as Error).message);
  });

  // Initialize AI learning integration
  await initializeLearningIntegration().catch(err => {
    console.warn('Learning integration setup failed (continuing):', (err as Error).message);
  });

  // Schedule continuous learning
  await scheduleContinuousLearning().catch(err => {
    console.warn('Continuous learning schedule failed (continuing):', (err as Error).message);
  });

  // Start server
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Server listening on port ${config.PORT}`);

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...');
    await buildWorker.close();
    await agentWorker.close();
    await monitorWorker.close();
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
