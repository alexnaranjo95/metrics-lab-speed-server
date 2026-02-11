import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites, assetOverrides } from '../db/schema.js';
import { validateSettingsOverride, APP_DEFAULTS } from '../shared/settingsSchema.js';
import { resolveSettingsFromData, diffSettings, matchUrlPattern } from '../shared/settingsMerge.js';
import { requireMasterKey } from '../middleware/auth.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET resolved settings for a site ───────────────────────────
  app.get<{ Params: { siteId: string }; Querystring: { assetUrl?: string } }>(
    '/sites/:siteId/settings',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const { assetUrl } = req.query;

      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
      });
      if (!site) return reply.code(404).send({ error: 'Site not found' });

      // Get matching asset overrides if an asset URL is provided
      let overrideSettings: any[] = [];
      if (assetUrl) {
        const allOverrides = await db.query.assetOverrides.findMany({
          where: eq(assetOverrides.siteId, siteId),
        });
        overrideSettings = allOverrides
          .filter(o => matchUrlPattern(assetUrl, o.urlPattern))
          .map(o => o.settings);
      }

      const resolved = resolveSettingsFromData(
        site.settings as any,
        overrideSettings.length > 0 ? overrideSettings : undefined
      );

      return reply.send({ settings: resolved, defaults: APP_DEFAULTS });
    }
  );

  // ─── PUT update site settings (sparse override) ─────────────────
  app.put<{ Params: { siteId: string }; Body: unknown }>(
    '/sites/:siteId/settings',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;

      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
      });
      if (!site) return reply.code(404).send({ error: 'Site not found' });

      // Validate the sparse override
      const validation = validateSettingsOverride(req.body);
      if (!validation.success) {
        return reply.code(400).send({
          error: 'Invalid settings',
          details: validation.error,
        });
      }

      await db.update(sites).set({
        settings: validation.data,
        updatedAt: new Date(),
      }).where(eq(sites.id, siteId));

      // Return the resolved settings after the update
      const resolved = resolveSettingsFromData(validation.data);
      return reply.send({ settings: resolved });
    }
  );

  // ─── GET settings diff (which fields are overridden) ────────────
  app.get<{ Params: { siteId: string } }>(
    '/sites/:siteId/settings/diff',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;

      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
      });
      if (!site) return reply.code(404).send({ error: 'Site not found' });

      const diff = diffSettings(site.settings as any);
      return reply.send({ diff, overrideCount: countLeaves(diff) });
    }
  );

  // ─── POST reset site settings to defaults ───────────────────────
  app.post<{ Params: { siteId: string } }>(
    '/sites/:siteId/settings/reset',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;

      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
      });
      if (!site) return reply.code(404).send({ error: 'Site not found' });

      await db.update(sites).set({
        settings: {},
        updatedAt: new Date(),
      }).where(eq(sites.id, siteId));

      return reply.send({ settings: APP_DEFAULTS });
    }
  );

  // ─── GET asset overrides list ───────────────────────────────────
  app.get<{ Params: { siteId: string } }>(
    '/sites/:siteId/asset-overrides',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;

      const overrides = await db.query.assetOverrides.findMany({
        where: eq(assetOverrides.siteId, siteId),
      });

      return reply.send({ overrides });
    }
  );

  // ─── POST create asset override ─────────────────────────────────
  app.post<{
    Params: { siteId: string };
    Body: { urlPattern: string; assetType?: string; settings: unknown };
  }>(
    '/sites/:siteId/asset-overrides',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const { urlPattern, assetType, settings: rawSettings } = req.body;

      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
      });
      if (!site) return reply.code(404).send({ error: 'Site not found' });

      if (!urlPattern) {
        return reply.code(400).send({ error: 'urlPattern is required' });
      }

      const validation = validateSettingsOverride(rawSettings);
      if (!validation.success) {
        return reply.code(400).send({
          error: 'Invalid settings',
          details: validation.error,
        });
      }

      const { nanoid } = await import('nanoid');
      const id = `ao_${nanoid(12)}`;

      await db.insert(assetOverrides).values({
        id,
        siteId,
        urlPattern,
        assetType: assetType || null,
        settings: validation.data,
      });

      const created = await db.query.assetOverrides.findFirst({
        where: eq(assetOverrides.id, id),
      });

      return reply.code(201).send({ override: created });
    }
  );

  // ─── PUT update asset override ──────────────────────────────────
  app.put<{
    Params: { siteId: string; overrideId: string };
    Body: { urlPattern?: string; assetType?: string; settings?: unknown };
  }>(
    '/sites/:siteId/asset-overrides/:overrideId',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId, overrideId } = req.params;
      const { urlPattern, assetType, settings: rawSettings } = req.body;

      const existing = await db.query.assetOverrides.findFirst({
        where: and(
          eq(assetOverrides.id, overrideId),
          eq(assetOverrides.siteId, siteId)
        ),
      });
      if (!existing) return reply.code(404).send({ error: 'Asset override not found' });

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (urlPattern !== undefined) updates.urlPattern = urlPattern;
      if (assetType !== undefined) updates.assetType = assetType || null;
      if (rawSettings !== undefined) {
        const validation = validateSettingsOverride(rawSettings);
        if (!validation.success) {
          return reply.code(400).send({
            error: 'Invalid settings',
            details: validation.error,
          });
        }
        updates.settings = validation.data;
      }

      await db.update(assetOverrides).set(updates).where(eq(assetOverrides.id, overrideId));

      const updated = await db.query.assetOverrides.findFirst({
        where: eq(assetOverrides.id, overrideId),
      });

      return reply.send({ override: updated });
    }
  );

  // ─── DELETE asset override ──────────────────────────────────────
  app.delete<{ Params: { siteId: string; overrideId: string } }>(
    '/sites/:siteId/asset-overrides/:overrideId',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId, overrideId } = req.params;

      const existing = await db.query.assetOverrides.findFirst({
        where: and(
          eq(assetOverrides.id, overrideId),
          eq(assetOverrides.siteId, siteId)
        ),
      });
      if (!existing) return reply.code(404).send({ error: 'Asset override not found' });

      await db.delete(assetOverrides).where(eq(assetOverrides.id, overrideId));

      return reply.send({ deleted: true });
    }
  );
};

/** Count leaf nodes in a diff object */
function countLeaves(obj: Record<string, any>): number {
  let count = 0;
  for (const value of Object.values(obj)) {
    if (value === true) {
      count++;
    } else if (typeof value === 'object' && value !== null) {
      count += countLeaves(value);
    }
  }
  return count;
}
