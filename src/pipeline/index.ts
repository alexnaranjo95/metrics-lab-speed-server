import fs from 'fs/promises';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites, builds, pages as pagesTable, assetOverrides } from '../db/schema.js';
import { crawlSite } from './crawl.js';
import { optimizeAll } from './optimize.js';
import { deployToCloudflare } from './deploy.js';
import { measurePerformance } from '../services/lighthouse.js';
import { notifyDashboard } from '../services/dashboardNotifier.js';
import { getCachedResolvedSettings } from '../shared/settingsMerge.js';
import { buildEmitter } from '../events/buildEmitter.js';
import { aiOptimizePage, isAIAvailable, getMonthlyUsage, trackTokenUsage, calculateCost } from '../services/aiOptimizer.js';
import { config } from '../config.js';
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

    // ═══ PHASE 2.5: AI OPTIMIZATION (if enabled) ═══
    if (resolvedSettings.ai.enabled && isAIAvailable()) {
      buildEmitter.emitPhase(buildId, 'ai');

      // Check monthly budget
      const monthlyUsage = await getMonthlyUsage();
      const monthlyCap = resolvedSettings.ai.monthlyCostCap;

      if (monthlyUsage.estimatedCost >= monthlyCap) {
        buildEmitter.log(buildId, 'ai', 'warn', `Monthly AI cost cap reached ($${monthlyUsage.estimatedCost.toFixed(2)}/$${monthlyCap})`);
      } else {
        const modelName = resolvedSettings.ai.model;
        buildEmitter.log(buildId, 'ai', 'info', `AI optimization enabled — model: ${modelName}`);
        buildEmitter.log(buildId, 'ai', 'info', `Monthly usage: $${monthlyUsage.estimatedCost.toFixed(2)} / $${monthlyCap} cap`);

        const outputDir = path.join(workDir, 'output');
        let buildTokensUsed = 0;
        let pagesOptimized = 0;

        for (const page of optimizeResult.pages) {
          // Check per-build token budget
          if (buildTokensUsed >= resolvedSettings.ai.perBuildTokenBudget) {
            buildEmitter.log(buildId, 'ai', 'warn', 'Build token budget exceeded, skipping remaining pages');
            break;
          }

          try {
            const htmlFilename = page.path === '/'
              ? 'index.html'
              : `${page.path.slice(1).replace(/\/$/, '')}/index.html`;
            const htmlPath = path.join(outputDir, htmlFilename);

            let html: string;
            try {
              html = await fs.readFile(htmlPath, 'utf-8');
            } catch {
              continue; // File may not exist
            }

            buildEmitter.log(buildId, 'ai', 'info', `Analyzing: ${page.path}`);

            const result = await aiOptimizePage(html, {
              model: modelName,
              maxTokens: resolvedSettings.ai.perPageTokenLimit,
              features: {
                altText: resolvedSettings.ai.features.altText,
                metaDescriptions: resolvedSettings.ai.features.metaDescriptions,
                structuredData: resolvedSettings.ai.features.structuredData,
                accessibilityImprovements: resolvedSettings.ai.features.accessibilityImprovements,
                contentOptimization: resolvedSettings.ai.features.contentOptimization,
              },
              customInstructions: resolvedSettings.ai.customInstructions,
              pageUrl: page.path,
            });

            // Track tokens
            const pageTokens = result.tokenUsage.input + result.tokenUsage.output;
            buildTokensUsed += pageTokens;
            await trackTokenUsage(result.tokenUsage.input, result.tokenUsage.output);

            if (result.changes.length > 0) {
              // Safety: reject if size changed drastically (already checked in service, but double-check)
              const sizeDiff = Math.abs(result.optimizedHtml.length - html.length) / html.length;
              if (sizeDiff > 0.5) {
                buildEmitter.log(buildId, 'ai', 'warn', `Skipping ${page.path} — output size differs by ${(sizeDiff * 100).toFixed(0)}%`);
                continue;
              }

              await fs.writeFile(htmlPath, result.optimizedHtml, 'utf-8');
              pagesOptimized++;

              for (const change of result.changes) {
                buildEmitter.log(buildId, 'ai', 'info', `[${change.impact}] ${change.description}`);
              }
            } else {
              buildEmitter.log(buildId, 'ai', 'info', `No additional optimizations for ${page.path}`);
            }
          } catch (err) {
            buildEmitter.log(buildId, 'ai', 'error', `Failed for ${page.path}: ${(err as Error).message}`);
            // Continue — never crash the build
          }
        }

        const totalCost = calculateCost(
          resolvedSettings.ai.model === 'claude-3-5-sonnet' ? 'claude-sonnet-4-20250514' : 'claude-sonnet-4-20250514',
          buildTokensUsed, 0
        );
        buildEmitter.log(buildId, 'ai', 'info', `AI optimization complete. ${pagesOptimized} pages optimized, ${buildTokensUsed} tokens used`);
      }
    } else if (resolvedSettings.ai.enabled && !isAIAvailable()) {
      buildEmitter.log(buildId, 'ai', 'warn', 'AI optimization enabled but no ANTHROPIC_API_KEY set — skipping');
    }

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

    // ═══ PHASE 4: MEASURE ═══
    buildEmitter.emitPhase(buildId, 'measure');
    buildEmitter.log(buildId, 'measure', 'info', 'Running performance measurement...');
    let originalScore = { performance: 0, ttfb: 0 };
    let edgeScore = { performance: 0, ttfb: 0 };

    try {
      [originalScore, edgeScore] = await Promise.all([
        measurePerformance(site.siteUrl),
        measurePerformance(deployResult.url),
      ]);
      buildEmitter.log(buildId, 'measure', 'info', `Lighthouse: ${originalScore.performance} → ${edgeScore.performance}`);
    } catch (err) {
      buildEmitter.log(buildId, 'measure', 'warn', `Lighthouse measurement failed (non-fatal): ${(err as Error).message}`);
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
