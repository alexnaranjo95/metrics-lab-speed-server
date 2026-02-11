import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites, builds, pages } from '../db/schema.js';
import { requireMasterKey } from '../middleware/auth.js';
import { generateWebhookSecret } from '../utils/crypto.js';
import { normalizeUrl, extractDomain, generateCloudflareProjectName } from '../utils/url.js';
import { buildQueue } from '../queue/buildQueue.js';
import { deletePagesProject } from '../services/cloudflare.js';

export async function siteRoutes(app: FastifyInstance) {
  // All site routes require master key
  app.addHook('onRequest', requireMasterKey);

  // ── GET /api/sites — List all sites ──
  app.get('/sites', async (request, reply) => {
    const allSites = await db.query.sites.findMany({
      orderBy: (s, { desc }) => [desc(s.updatedAt)],
    });

    const sitesWithBuilds = await Promise.all(
      allSites.map(async (site) => {
        let lastBuild = null;
        if (site.lastBuildId) {
          const build = await db.query.builds.findFirst({
            where: eq(builds.id, site.lastBuildId),
          });
          if (build) {
            lastBuild = {
              id: build.id,
              status: build.status,
              startedAt: build.startedAt,
              completedAt: build.completedAt,
              originalSizeBytes: build.originalSizeBytes,
              optimizedSizeBytes: build.optimizedSizeBytes,
              lighthouseScoreBefore: build.lighthouseScoreBefore,
              lighthouseScoreAfter: build.lighthouseScoreAfter,
              errorMessage: build.errorMessage,
            };
          }
        }
        return {
          id: site.id,
          name: site.name,
          siteUrl: site.siteUrl,
          status: site.status,
          edgeUrl: site.edgeUrl,
          cloudflareProjectName: site.cloudflareProjectName,
          pageCount: site.pageCount,
          totalSizeBytes: site.totalSizeBytes,
          lastBuild,
          createdAt: site.createdAt,
          updatedAt: site.updatedAt,
        };
      })
    );

    return { sites: sitesWithBuilds };
  });

  // ── POST /api/sites — Create a site ──
  app.post('/sites', async (request, reply) => {
    const body = request.body as { name?: string; site_url?: string };

    if (!body.name || !body.site_url) {
      return reply.status(400).send({ error: 'name and site_url are required' });
    }

    const siteUrl = normalizeUrl(body.site_url);
    const domain = extractDomain(siteUrl);

    // Check for duplicate URL
    const existing = await db.query.sites.findFirst({
      where: eq(sites.siteUrl, siteUrl),
    });
    if (existing) {
      return reply.status(409).send({
        error: 'A site with this URL already exists',
        siteId: existing.id,
      });
    }

    const id = `site_${nanoid(12)}`;
    const webhookSecret = generateWebhookSecret();
    const cloudflareProjectName = generateCloudflareProjectName(domain);

    const [site] = await db.insert(sites).values({
      id,
      name: body.name,
      siteUrl,
      webhookSecret,
      cloudflareProjectName,
      status: 'active',
    }).returning();

    return reply.status(201).send({
      id: site.id,
      name: site.name,
      site_url: site.siteUrl,
      webhookSecret: site.webhookSecret,
      cloudflareProjectName: site.cloudflareProjectName,
      status: site.status,
      createdAt: site.createdAt,
    });
  });

  // ── GET /api/sites/:siteId — Get site details ──
  app.get('/sites/:siteId', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
    });

    if (!site) {
      return reply.status(404).send({ error: 'Site not found' });
    }

    return site;
  });

  // ── GET /api/sites/:siteId/status — Get site status ──
  app.get('/sites/:siteId/status', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
    });

    if (!site) {
      return reply.status(404).send({ error: 'Site not found' });
    }

    // Get latest build info
    let lastBuild = null;
    if (site.lastBuildId) {
      const build = await db.query.builds.findFirst({
        where: eq(builds.id, site.lastBuildId),
      });
      if (build) {
        lastBuild = {
          id: build.id,
          status: build.status,
          pagesProcessed: build.pagesProcessed,
          pagesTotal: build.pagesTotal,
          startedAt: build.startedAt,
          completedAt: build.completedAt,
        };
      }
    }

    return {
      id: site.id,
      status: site.status,
      lastBuild,
      edgeUrl: site.edgeUrl,
      pageCount: site.pageCount,
    };
  });

  // ── DELETE /api/sites/:siteId — Delete a site ──
  app.delete('/sites/:siteId', async (request, reply) => {
    const { siteId } = request.params as { siteId: string };

    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
    });

    if (!site) {
      return reply.status(404).send({ error: 'Site not found' });
    }

    // Cancel any in-progress builds in the queue
    const inProgressBuilds = await db.query.builds.findMany({
      where: (b, { and, eq: e, inArray }) =>
        and(e(b.siteId, siteId), inArray(b.status, ['queued', 'crawling', 'optimizing', 'deploying'])),
    });

    for (const build of inProgressBuilds) {
      try {
        const jobs = await buildQueue.getJobs(['waiting', 'active', 'delayed']);
        for (const job of jobs) {
          if (job.data.buildId === build.id) {
            await job.remove();
          }
        }
        await db.update(builds).set({
          status: 'failed',
          errorMessage: 'Site deleted',
          completedAt: new Date(),
        }).where(eq(builds.id, build.id));
      } catch (err) {
        console.warn(`Failed to cancel build ${build.id}:`, (err as Error).message);
      }
    }

    // Delete Cloudflare Pages project
    if (site.cloudflareProjectName) {
      try {
        await deletePagesProject(site.cloudflareProjectName);
      } catch (err) {
        console.warn(`Failed to delete CF project for site ${siteId}:`, (err as Error).message);
      }
    }

    // Delete site (cascade deletes pages and builds)
    await db.delete(sites).where(eq(sites.id, siteId));

    return reply.status(204).send();
  });
}
