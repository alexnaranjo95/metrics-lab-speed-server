import fs from 'fs/promises';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites, builds, pages as pagesTable, assetOverrides } from '../db/schema.js';
import { crawlSite } from './crawl.js';
import { optimizeAll } from './optimize.js';
import { deployToCloudflare } from './deploy.js';
import { measureWithPageSpeed, isPageSpeedAvailable, runComparison, type PageSpeedResult } from '../services/pagespeed.js';
import { notifyDashboard } from '../services/dashboardNotifier.js';
import { getCachedResolvedSettings } from '../shared/settingsMerge.js';
import { buildEmitter } from '../events/buildEmitter.js';
import type { OptimizationSettings } from '../shared/settingsSchema.js';

async function updateBuildStatus(buildId: string, status: string) {
  const updates: Record<string, any> = { status };
  if (status === 'crawling') {
    updates.startedAt = new Date();
  }
  await db.update(builds).set(updates).where(eq(builds.id, buildId));
}

async function updateBuild(buildId: string, data: Record<string, any>) {
  await db.update(builds).set(data).where(eq(builds.id, buildId));
}

async function updateSite(siteId: string, data: Record<string, any>) {
  await db.update(sites).set({ ...data, updatedAt: new Date() }).where(eq(sites.id, siteId));
}

async function getExistingPages(siteId: string) {
  return db.query.pages.findMany({
    where: eq(pagesTable.siteId, siteId),
  });
}

async function upsertPages(siteId: string, crawledPages: Array<{ path: string; title: string; contentHash: string; originalSizeBytes: number; optimizedSizeBytes: number }>) {
  const { nanoid } = await import('nanoid');

  for (const page of crawledPages) {
    const existing = await db.query.pages.findFirst({
      where: (p, { and, eq: e }) => and(e(p.siteId, siteId), e(p.path, page.path)),
    });

    if (existing) {
      await db.update(pagesTable).set({
        title: page.title,
        contentHash: page.contentHash,
        originalSizeBytes: page.originalSizeBytes,
        optimizedSizeBytes: page.optimizedSizeBytes,
        lastCrawledAt: new Date(),
        lastDeployedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(pagesTable.id, existing.id));
    } else {
      await db.insert(pagesTable).values({
        id: `page_${nanoid(12)}`,
        siteId,
        path: page.path,
        title: page.title,
        contentHash: page.contentHash,
        originalSizeBytes: page.originalSizeBytes,
        optimizedSizeBytes: page.optimizedSizeBytes,
        lastCrawledAt: new Date(),
        lastDeployedAt: new Date(),
      });
    }
  }
}

export async function runBuildPipeline(
  buildId: string,
  siteId: string,
  scope: string,
  targetPages?: string[]
) {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site ${siteId} not found`);

  const build = await db.query.builds.findFirst({ where: eq(builds.id, buildId) });
  if (!build) throw new Error(`Build ${buildId} not found`);

  // Resolve and snapshot settings for this build (with Redis cache)
  const resolvedSettings = await getCachedResolvedSettings(siteId, site.settings as any);
  await updateBuild(buildId, { resolvedSettings });

  const workDir = `/tmp/builds/${buildId}`;
  await fs.mkdir(workDir, { recursive: true });

  try {
    // ═══ PHASE 1: CRAWL ═══
    buildEmitter.emitPhase(buildId, 'crawl');
    buildEmitter.log(buildId, 'crawl', 'info', `Starting crawl of ${site.siteUrl}`);
    await updateBuildStatus(buildId, 'crawling');
    await notifyDashboard(site, build, 'crawling');

    const existingPages = scope === 'partial' ? await getExistingPages(siteId) : [];
    const crawlResult = await crawlSite({
      siteUrl: site.siteUrl,
      workDir,
      scope,
      existingPages: existingPages.map(p => ({ path: p.path, contentHash: p.contentHash ?? '' })),
      targetPages,
      buildId,
    });

    buildEmitter.log(buildId, 'crawl', 'info', `Crawl complete: ${crawlResult.totalPages} pages, ${crawlResult.assets.size} assets`);

    await updateBuild(buildId, {
      pagesTotal: crawlResult.totalPages,
      originalSizeBytes: crawlResult.totalBytes,
    });

    // Fail loudly if no pages were crawled
    if (crawlResult.totalPages === 0) {
      throw new Error(
        `Crawl returned 0 pages for ${site.siteUrl}. ` +
        `The site may be behind bot protection (Cloudflare/LiteSpeed), ` +
        `unreachable from the build server, or returning error responses. ` +
        `Check the [crawl] logs above for details.`
      );
    }

    // ═══ PHASE 2: OPTIMIZE (with 10-minute timeout) ═══
    buildEmitter.emitPhase(buildId, 'images');
    buildEmitter.log(buildId, 'images', 'info', `Starting optimization of ${crawlResult.totalPages} pages...`);
    await updateBuildStatus(buildId, 'optimizing');
    await notifyDashboard(site, build, 'optimizing');

    const OPTIMIZE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const optimizePromise = optimizeAll({
      pages: crawlResult.pages,
      assets: crawlResult.assets,
      workDir,
      siteUrl: site.siteUrl,
      settings: resolvedSettings,
      buildId,
      onPageProcessed: async (pageIndex: number) => {
        await updateBuild(buildId, { pagesProcessed: pageIndex + 1 });
        buildEmitter.log(buildId, 'html', 'info', `Processed page ${pageIndex + 1}/${crawlResult.totalPages}`);
      },
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(
        `Optimization timed out after ${OPTIMIZE_TIMEOUT_MS / 60000} minutes. ` +
        `The site may have too many pages or assets. Check [optimize] logs for the last step that ran.`
      )), OPTIMIZE_TIMEOUT_MS);
    });
    const optimizeResult = await Promise.race([optimizePromise, timeoutPromise]);

    buildEmitter.log(buildId, 'html', 'info', `Optimization complete`, {
      savings: { before: optimizeResult.stats.images.originalBytes + optimizeResult.stats.css.originalBytes + optimizeResult.stats.js.originalBytes,
                 after: optimizeResult.stats.images.optimizedBytes + optimizeResult.stats.css.optimizedBytes + optimizeResult.stats.js.optimizedBytes },
    });

    await updateBuild(buildId, {
      jsOriginalBytes: optimizeResult.stats.js.originalBytes,
      jsOptimizedBytes: optimizeResult.stats.js.optimizedBytes,
      cssOriginalBytes: optimizeResult.stats.css.originalBytes,
      cssOptimizedBytes: optimizeResult.stats.css.optimizedBytes,
      imageOriginalBytes: optimizeResult.stats.images.originalBytes,
      imageOptimizedBytes: optimizeResult.stats.images.optimizedBytes,
      facadesApplied: optimizeResult.stats.facades.total,
      scriptsRemoved: optimizeResult.stats.scriptsRemoved,
    });

    // ═══ PHASE 2.5: AI OPTIMIZATION ═══
    // Note: The full AI agent (src/ai/agent.ts) handles autonomous optimization.
    // The per-build AI step is now handled entirely by the agent system.
    // The legacy per-page AI step has been removed — use POST /api/sites/:siteId/ai/optimize instead.

    // ═══ PHASE 3: DEPLOY ═══
    buildEmitter.emitPhase(buildId, 'deploy');
    buildEmitter.log(buildId, 'deploy', 'info', 'Deploying to Cloudflare Pages...');
    await updateBuildStatus(buildId, 'deploying');
    await notifyDashboard(site, build, 'deploying');

    const deployResult = await deployToCloudflare({
      projectName: site.cloudflareProjectName ?? `mls-${siteId}`,
      outputDir: `${workDir}/output`,
      siteUrl: site.siteUrl,
    });

    buildEmitter.log(buildId, 'deploy', 'info', `Deployed to ${deployResult.url}`);

    // Wait for SSL certificate provisioning on Cloudflare Pages
    buildEmitter.log(buildId, 'deploy', 'info', 'Waiting for SSL certificate provisioning...');
    const sslReady = await waitForSslReady(deployResult.url, 120000);
    if (sslReady) {
      buildEmitter.log(buildId, 'deploy', 'info', 'SSL ready — site is accessible');
    } else {
      buildEmitter.log(buildId, 'deploy', 'warn', 'SSL not ready after 2 minutes — continuing anyway');
    }

    // ═══ PHASE 4: MEASURE ═══
    buildEmitter.emitPhase(buildId, 'measure');
    const psiAvailable = isPageSpeedAvailable();
    buildEmitter.log(buildId, 'measure', 'info',
      `Running performance measurement${psiAvailable ? ' via PageSpeed Insights API' : ' via Playwright heuristic'}...`
    );

    let originalScore: PageSpeedResult = { performance: 0, lcp: 0, tbt: 0, cls: 0, fcp: 0, si: 0, ttfb: 0, strategy: 'mobile', opportunities: [], fieldData: null };
    let edgeScore: PageSpeedResult = { ...originalScore };

    try {
      // Calculate payload savings from optimization results
      const payloadSavings = {
        totalKb: optimizeResult.stats
          ? Math.round(((optimizeResult.stats.images.originalBytes - optimizeResult.stats.images.optimizedBytes)
            + (optimizeResult.stats.js.originalBytes - optimizeResult.stats.js.optimizedBytes)
            + (optimizeResult.stats.css.originalBytes - optimizeResult.stats.css.optimizedBytes)) / 1024)
          : undefined,
        imageKb: optimizeResult.stats
          ? Math.round((optimizeResult.stats.images.originalBytes - optimizeResult.stats.images.optimizedBytes) / 1024)
          : undefined,
        jsKb: optimizeResult.stats
          ? Math.round((optimizeResult.stats.js.originalBytes - optimizeResult.stats.js.optimizedBytes) / 1024)
          : undefined,
        cssKb: optimizeResult.stats
          ? Math.round((optimizeResult.stats.css.originalBytes - optimizeResult.stats.css.optimizedBytes) / 1024)
          : undefined,
      };

      // Run full comparison (mobile + desktop) and persist to performance_comparisons
      const comparisons = await runComparison(
        siteId,
        site.siteUrl,
        deployResult.url,
        buildId,
        payloadSavings
      );

      // Extract mobile results for the build record (backward compat)
      const mobileComparison = comparisons.find(c => c.strategy === 'mobile');
      if (mobileComparison) {
        originalScore = mobileComparison.original;
        edgeScore = mobileComparison.optimized;
      }

      const fmtScore = (r: PageSpeedResult) =>
        `Score ${r.performance}, LCP ${(r.lcp / 1000).toFixed(1)}s, TBT ${Math.round(r.tbt)}ms, CLS ${r.cls}, FCP ${(r.fcp / 1000).toFixed(1)}s, SI ${(r.si / 1000).toFixed(1)}s`;

      for (const c of comparisons) {
        buildEmitter.log(buildId, 'measure', 'info', `[measure] Origin (${c.strategy}): ${fmtScore(c.original)}`);
        buildEmitter.log(buildId, 'measure', 'info', `[measure] Edge (${c.strategy}):   ${fmtScore(c.optimized)}`);
      }
      buildEmitter.log(buildId, 'measure', 'info', `Performance: ${originalScore.performance} → ${edgeScore.performance}`);
    } catch (err) {
      buildEmitter.log(buildId, 'measure', 'warn', `Performance measurement failed (non-fatal): ${(err as Error).message}`);
    }

    // ═══ PHASE 5: FINALIZE ═══
    const startedAt = build.startedAt ? new Date(build.startedAt).getTime() : Date.now();
    await updateBuild(buildId, {
      status: 'success',
      optimizedSizeBytes: optimizeResult.totalOptimizedBytes,
      lighthouseScoreBefore: originalScore.performance,
      lighthouseScoreAfter: edgeScore.performance,
      ttfbBefore: originalScore.ttfb,
      ttfbAfter: edgeScore.ttfb,
      completedAt: new Date(),
    });

    await updateSite(siteId, {
      lastBuildId: buildId,
      lastBuildStatus: 'success',
      lastBuildAt: new Date(),
      edgeUrl: deployResult.url,
      pageCount: crawlResult.totalPages,
      totalSizeBytes: optimizeResult.totalOptimizedBytes,
    });

    // Save/update page records for future partial builds
    await upsertPages(siteId, optimizeResult.pages.map(p => ({
      path: p.path,
      title: p.title,
      contentHash: p.contentHash,
      originalSizeBytes: p.originalSizeBytes,
      optimizedSizeBytes: p.optimizedSizeBytes,
    })));

    await notifyDashboard(site, build, 'success');
    buildEmitter.emitComplete(buildId, true);
    buildEmitter.log(buildId, 'deploy', 'info', 'Build completed successfully');

    // Persist build output for Live Edit workspace
    const liveEditDir = process.env.LIVE_EDIT_WORKSPACE_DIR || './data/live-edit';
    const workspacePath = path.join(liveEditDir, siteId);
    try {
      await fs.mkdir(path.dirname(workspacePath), { recursive: true });
      await fs.cp(`${workDir}/output`, workspacePath, { recursive: true, force: true });
      buildEmitter.log(buildId, 'deploy', 'info', `Live Edit workspace updated at ${workspacePath}`);
    } catch (copyErr) {
      buildEmitter.log(buildId, 'deploy', 'warn', `Failed to persist Live Edit workspace (non-fatal): ${(copyErr as Error).message}`);
    }

  } catch (error: any) {
    buildEmitter.log(buildId, 'deploy', 'error', `Build failed: ${error.message}`);
    buildEmitter.emitComplete(buildId, false, error.message);

    const currentBuild = await db.query.builds.findFirst({ where: eq(builds.id, buildId) });
    await updateBuild(buildId, {
      status: 'failed',
      errorMessage: error.message,
      errorDetails: { stack: error.stack, phase: currentBuild?.status ?? 'unknown' },
      completedAt: new Date(),
    });

    await updateSite(siteId, {
      lastBuildId: buildId,
      lastBuildStatus: 'failed',
      lastBuildAt: new Date(),
    });

    await notifyDashboard(site, build, 'failed');

    throw error; // Re-throw so BullMQ marks the job as failed
  } finally {
    // Clean up the work directory
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Wait for a Cloudflare Pages URL to become accessible (SSL provisioning).
 * Polls every 10 seconds. Returns true if accessible, false if timeout.
 */
async function waitForSslReady(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
        // @ts-ignore — Node 18+ supports this
        dispatcher: undefined,
      });
      if (response.ok || response.status === 304) return true;
    } catch {
      // SSL error or network error — keep waiting
    }
    await new Promise(r => setTimeout(r, 10000));
  }
  return false;
}
