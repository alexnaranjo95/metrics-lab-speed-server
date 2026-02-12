import fs from 'fs/promises';
import path from 'path';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { sites, builds } from '../db/schema.js';
import { buildQueue } from '../queue/buildQueue.js';
import { buildEmitter } from '../events/buildEmitter.js';
import { deepMerge } from '../shared/settingsMerge.js';
import { analyzeSite } from './analyzer.js';
import { generateOptimizationPlan } from './planner.js';
import { fetchFullPageSpeedData, isPageSpeedAvailable } from '../services/pagespeed.js';
import { aiReviewAndAdjust } from './reviewer.js';
import { compareVisuals } from '../verification/visual.js';
import { verifyFunctionalBehavior } from '../verification/functional.js';
import { verifyAllLinks } from '../verification/links.js';
import { measurePerformanceAll } from '../verification/performance.js';
import type { SiteInventory, IterationResult, AgentReport, AgentPhase } from './types.js';

const MAX_ITERATIONS = 10;

// ─── Agent State (in-memory, per siteId) ──────────────────────────

interface AgentState {
  siteId: string;
  runId: string;
  domain: string;
  startedAt: string;
  phase: AgentPhase;
  iteration: number;
  maxIterations: number;
  logs: Array<{ timestamp: string; message: string }>;
  report: AgentReport | null;
  aborted: boolean;
  phaseTimings: Record<string, { start: string; end?: string }>;
  lastError?: string;
  lastSuccessfulPhase?: string;
}

const activeAgents = new Map<string, AgentState>();

export function getAgentState(siteId: string): AgentState | null {
  return activeAgents.get(siteId) || null;
}

export function stopAgent(siteId: string): boolean {
  const agent = activeAgents.get(siteId);
  if (agent) { agent.aborted = true; return true; }
  return false;
}

// ─── Main Agent Entry Point ───────────────────────────────────────

export async function runOptimizationAgent(siteId: string): Promise<AgentReport> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site ${siteId} not found`);

  const runId = `agent_${nanoid(12)}`;
  const workDir = `/tmp/ai-agent/${runId}`;
  await fs.mkdir(workDir, { recursive: true });

  const now = new Date().toISOString();
  const state: AgentState = {
    siteId, runId,
    domain: site.siteUrl,
    startedAt: now,
    phase: 'analyzing', iteration: 0, maxIterations: MAX_ITERATIONS,
    logs: [], report: null, aborted: false,
    phaseTimings: {},
  };
  activeAgents.set(siteId, state);

  const log = (msg: string) => {
    const entry = { timestamp: new Date().toISOString(), message: msg };
    state.logs.push(entry);
    console.log(`[ai-agent] ${msg}`);
    buildEmitter.emit(`agent:${siteId}:log`, entry);
  };

  const setPhase = (phase: AgentPhase) => {
    // End timing for previous phase
    if (state.phase && state.phaseTimings[state.phase] && !state.phaseTimings[state.phase].end) {
      state.phaseTimings[state.phase].end = new Date().toISOString();
    }
    // Start timing for new phase
    state.phase = phase;
    state.phaseTimings[phase] = { start: new Date().toISOString() };
    if (phase !== 'complete' && phase !== 'failed') {
      state.lastSuccessfulPhase = phase;
    }
    buildEmitter.emit(`agent:${siteId}:phase`, phase);
  };

  try {
    const domain = new URL(site.siteUrl).hostname;
    log('═══════════════════════════════════════════════');
    log('  METRICS LAB AI OPTIMIZATION AGENT');
    log(`  Site: ${domain}`);
    log(`  Model: Claude Opus 4.6 (claude-opus-4.6-20250514)`);
    log(`  Max iterations: ${MAX_ITERATIONS}`);
    log('═══════════════════════════════════════════════');

    // ── PHASE 1: ANALYZE ──
    setPhase('analyzing');
    log('PHASE 1: Analyzing live website...');

    const inventory = await analyzeSite(site.siteUrl, workDir, log);
    log(`Pages: ${inventory.pageCount}`);
    log(`Scripts: ${inventory.scripts.length}`);
    log(`Interactive elements: ${inventory.interactiveElements.filter(e => e.type !== 'link').length}`);
    log(`jQuery used: ${inventory.jqueryUsed ? 'YES (' + inventory.jqueryDependentScripts.join(', ') + ')' : 'No'}`);
    log(`Baseline screenshots: ${inventory.baselineScreenshots.length}`);
    log(`Baseline behaviors: ${inventory.baselineBehavior.filter(b => b.passed).length} recorded`);

    if (state.aborted) { log('Agent aborted by user.'); setPhase('failed'); return buildReport(state, inventory, []); }

    // ── PHASE 1B: PageSpeed Insights (when available) ──
    let pageSpeedData = null;
    if (isPageSpeedAvailable()) {
      log('Fetching PageSpeed Insights (all categories)...');
      try {
        pageSpeedData = await fetchFullPageSpeedData(site.siteUrl, 'mobile');
        if (pageSpeedData) {
          log(`PageSpeed: Perf=${pageSpeedData.scores.performance}, A11y=${pageSpeedData.scores.accessibility}, SEO=${pageSpeedData.scores.seo}`);
          log(`Optimization plan: ${pageSpeedData.optimizationPlan.length} actions`);
        }
      } catch (e) {
        log(`PageSpeed fetch failed: ${(e as Error).message} — continuing without`);
      }
    }

    // ── PHASE 1B: AI PLANNING ──
    setPhase('planning');
    log('PHASE 1B: AI generating optimization plan...');

    const plan = await generateOptimizationPlan(inventory, log, pageSpeedData);
    log(`Expected Lighthouse: ${plan.expectedPerformance?.lighthouse || 'N/A'}`);
    log(`Risks: ${plan.risks?.length || 0}`);

    // ── ITERATION LOOP ──
    let currentSettings = plan.settings || {};
    const iterationHistory: IterationResult[] = [];
    let finalVerdict = 'needs-changes';

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      if (state.aborted) { log('Agent aborted by user.'); break; }
      state.iteration = iteration;

      log(`\n${'═'.repeat(50)}`);
      log(`  ITERATION ${iteration}/${MAX_ITERATIONS}`);
      log(`${'═'.repeat(50)}`);

      try {
        // ── PHASE 2: BUILD ──
        setPhase('building');
        log('PHASE 2: Applying settings and building...');

        logSettingsDecisions(currentSettings, log);

        await db.update(sites).set({ settings: currentSettings, updatedAt: new Date() }).where(eq(sites.id, siteId));

        const buildId = `build_${nanoid(12)}`;
        const existingBuilds = await db.select({ id: builds.id }).from(builds).where(eq(builds.siteId, siteId));
        const deploymentNumber = existingBuilds.length + 1;
        await db.insert(builds).values({ id: buildId, siteId, scope: 'full', triggeredBy: 'ai-agent', status: 'queued', deploymentNumber });
        await buildQueue.add('build' as any, { buildId, siteId, scope: 'full' }, { jobId: buildId });

        log(`Build ${buildId} queued. Waiting for completion (up to 30 min)...`);
        const buildResult = await waitForBuild(buildId, 1800000, log);

        if (buildResult.status === 'failed') {
          state.lastError = buildResult.errorMessage || 'Build failed';
          log(`Build failed: ${buildResult.errorMessage || 'Unknown error'}`);
          if (iteration < MAX_ITERATIONS) {
            currentSettings = makeSaferSettings(currentSettings);
            log('Retrying with safer settings...');
            continue;
          }
          break;
        }

        state.lastError = undefined; // Clear error on success

        const edgeUrl = buildResult.edgeUrl;
        if (!edgeUrl) {
          log('Build succeeded but no edge URL. Cannot verify.');
          continue;
        }

        log(`Build complete. Edge URL: ${edgeUrl}`);

        // Wait for SSL to be ready on the Cloudflare Pages URL
        log('Waiting for SSL certificate provisioning...');
        const sslReady = await waitForSslReady(edgeUrl, 120000);
        if (sslReady) {
          log('SSL ready — site is accessible');
        } else {
          log('SSL not ready after 2 minutes — proceeding with verification anyway');
        }

        // ── PHASE 3: VERIFY ──
        setPhase('verifying');
        log('PHASE 3: Running verification suite...');

        log('Visual comparison...');
        const visualResults = await compareVisuals(edgeUrl, inventory.pages, inventory.baselineScreenshots, workDir, log);
        const visPassed = visualResults.filter(v => v.status === 'identical' || v.status === 'acceptable').length;
        const visFailed = visualResults.filter(v => v.status === 'failed' || v.status === 'needs-review').length;
        log(`Visual: ${visPassed} passed, ${visFailed} need attention`);

        log('Functional testing...');
        const funcResults = await verifyFunctionalBehavior(edgeUrl, inventory.interactiveElements, inventory.baselineBehavior, log);
        const fPassed = funcResults.filter(t => t.passed).length;
        const fFailed = funcResults.filter(t => !t.passed).length;
        log(`Functional: ${fPassed} passed, ${fFailed} failed`);

        log('Link verification...');
        const linkResults = await verifyAllLinks(site.siteUrl, edgeUrl, inventory.pages, log);
        const lFailed = linkResults.filter(l => !l.passed).length;

        log('Performance measurement...');
        const perfResults = await measurePerformanceAll(edgeUrl, inventory.pages, log);
        const avgPerf = perfResults.length > 0 ? perfResults.reduce((s, p) => s + p.performance, 0) / perfResults.length : 0;
        const worstPerf = perfResults.length > 0 ? Math.min(...perfResults.map(p => p.performance)) : 0;
        log(`Performance: avg ${avgPerf.toFixed(0)}, worst ${worstPerf}`);

        const iterResult: IterationResult = {
          iteration, settings: currentSettings, buildId, edgeUrl,
          performance: perfResults, visualComparisons: visualResults,
          functionalTests: funcResults, linkVerification: linkResults,
        };
        iterationHistory.push(iterResult);

        // ── CHECK PASS CONDITIONS ──
        const allVisualPass = visFailed === 0;
        const allFuncPass = fFailed === 0;
        const allLinksPass = lFailed === 0;

        if (allVisualPass && allFuncPass && allLinksPass) {
          log('\nALL CHECKS PASSED!');
          log(`  Visual: All pages match original`);
          log(`  Functional: All ${fPassed} interactive elements work`);
          log(`  Links: All valid`);
          log(`  Performance: Avg ${avgPerf.toFixed(0)}, worst ${worstPerf}`);
          finalVerdict = 'pass';
          break;
        }

        if (allVisualPass && allFuncPass && allLinksPass && avgPerf >= 80) {
          log('Visual + Functional + Links pass. Performance acceptable.');
          finalVerdict = 'pass';
          break;
        }

        if (state.aborted) { log('Agent aborted by user.'); break; }

        // ── PHASE 4: AI REVIEW & ADJUST ──
        setPhase('reviewing');
        log('PHASE 4: AI reviewing results and adjusting...');

        const review = await aiReviewAndAdjust(iterResult, iterationHistory.slice(0, -1), inventory, log);

        if (!review.shouldRebuild || review.overallVerdict === 'pass') {
          log(`AI decided: ${review.overallVerdict}. No further changes.`);
          finalVerdict = review.overallVerdict;
          break;
        }

        if (review.settingChanges && Object.keys(review.settingChanges).length > 0) {
          currentSettings = deepMerge(currentSettings, review.settingChanges);
          log('Settings adjusted for next iteration:');
          for (const [key, value] of Object.entries(review.settingChanges)) {
            log(`  ${key}: ${JSON.stringify(value).substring(0, 100)}`);
          }
        }

      } catch (iterError: any) {
        // Per-iteration error recovery: log and continue
        state.lastError = iterError.message;
        log(`Iteration ${iteration} error: ${iterError.message}`);
        if (iteration < MAX_ITERATIONS) {
          currentSettings = makeSaferSettings(currentSettings);
          log('Recovering with safer settings for next iteration...');
          continue;
        }
        log('Max iterations reached with errors. Stopping.');
        break;
      }
    }

    // ── FINAL REPORT ──
    setPhase('complete');
    const report = buildReport(state, inventory, iterationHistory, finalVerdict);
    state.report = report;

    log('\n═══════════════════════════════════════════════');
    log('  OPTIMIZATION COMPLETE');
    log(`  Iterations: ${iterationHistory.length}`);
    log(`  Verdict: ${finalVerdict}`);
    log('═══════════════════════════════════════════════');

    buildEmitter.emit(`agent:${siteId}:complete`, report);
    return report;

  } catch (error: any) {
    state.lastError = error.message;
    setPhase('failed');
    log(`Agent error: ${error.message}`);
    const report = buildReport(state, null, [], 'failed');
    state.report = report;
    buildEmitter.emit(`agent:${siteId}:complete`, report);
    return report;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    setTimeout(() => activeAgents.delete(siteId), 3600000);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

async function waitForBuild(buildId: string, timeoutMs: number, log?: (msg: string) => void): Promise<{ status: string; edgeUrl: string | null; errorMessage: string | null }> {
  const start = Date.now();
  let lastStatus = '';
  while (Date.now() - start < timeoutMs) {
    const build = await db.query.builds.findFirst({ where: eq(builds.id, buildId) });
    if (!build) throw new Error(`Build ${buildId} not found`);

    if (build.status !== lastStatus) {
      const pages = build.pagesTotal ? `${build.pagesProcessed || 0}/${build.pagesTotal} pages` : '';
      if (log) log(`Build status: ${build.status}${pages ? ` (${pages})` : ''}`);
      lastStatus = build.status;
    }

    if (build.status === 'success' || build.status === 'failed') {
      const site = await db.query.sites.findFirst({ where: eq(sites.id, build.siteId) });
      return { status: build.status, edgeUrl: site?.edgeUrl || null, errorMessage: build.errorMessage };
    }
    await sleep(5000);
  }
  throw new Error(`Build ${buildId} timed out after ${timeoutMs / 1000}s`);
}

function buildReport(state: AgentState, inventory: SiteInventory | null, history: IterationResult[], verdict?: string): AgentReport {
  const lastIter = history[history.length - 1];
  return {
    siteId: state.siteId,
    originalUrl: state.domain,
    totalIterations: history.length,
    finalVerdict: verdict || 'incomplete',
    finalSettings: lastIter?.settings || {},
    baselinePerformance: 0,
    finalPerformance: lastIter?.performance || [],
    visualResults: lastIter?.visualComparisons || [],
    functionalResults: lastIter?.functionalTests || [],
    linkResults: lastIter?.linkVerification || [],
    iterationHistory: history.map(i => ({
      iteration: i.iteration,
      avgPerformance: i.performance.length > 0 ? i.performance.reduce((s, p) => s + p.performance, 0) / i.performance.length : 0,
      visualFailures: i.visualComparisons.filter(v => v.status === 'failed' || v.status === 'needs-review').length,
      functionalFailures: i.functionalTests.filter(t => !t.passed).length,
      brokenLinks: i.linkVerification.filter(l => !l.passed).length,
    })),
  };
}

function makeSaferSettings(settings: Record<string, any>): Record<string, any> {
  return deepMerge(settings, {
    css: { purge: false, purgeAggressiveness: 'safe' },
    js: { removeJquery: false, enabled: true },
    html: { aggressive: { removeAttributeQuotes: false, removeOptionalTags: false, removeEmptyElements: false } },
  });
}

function logSettingsDecisions(settings: Record<string, any>, log: (msg: string) => void) {
  const s = settings;
  if (s.images) log(`[settings] Images: enabled=${s.images.enabled}, WebP quality=${s.images.webp?.quality || 80}, AVIF=${s.images.convertToAvif ? 'ON' : 'OFF'}`);
  if (s.css) log(`[settings] CSS: purge=${s.css.purge ? 'ON' : 'OFF'}, aggressiveness=${s.css.purgeAggressiveness || 'safe'}, critical=${s.css.critical ? 'ON' : 'OFF'}`);
  if (s.js) log(`[settings] JS: removeJquery=${s.js.removeJquery ? 'YES (risky!)' : 'NO (safe)'}, emoji=${s.js.removeScripts?.wpEmoji ? 'remove' : 'keep'}`);
  if (s.fonts) log(`[settings] Fonts: selfHost=${s.fonts.selfHostGoogleFonts ? 'ON' : 'OFF'}, display=${s.fonts.fontDisplay || 'swap'}`);
  if (s.video) log(`[settings] Video: facades=${s.video.facadesEnabled ? 'ON' : 'OFF'}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForSslReady(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
      if (response.ok || response.status === 304) return true;
    } catch {
      // SSL or network error — keep waiting
    }
    await sleep(10000);
  }
  return false;
}
