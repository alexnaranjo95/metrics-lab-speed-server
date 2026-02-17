import fs from 'fs/promises';
import path from 'path';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { sites, builds, agentRuns } from '../db/schema.js';
import { buildQueue } from '../queue/buildQueue.js';
import { buildEmitter } from '../events/buildEmitter.js';
import { deepMerge } from '../shared/settingsMerge.js';
import { analyzeSite } from './analyzer.js';
import { generateOptimizationPlan } from './planner.js';
import { fetchFullPageSpeedData, isPageSpeedAvailable, type OptimizationWorkflow } from '../services/pagespeed.js';
import { aiReviewAndAdjust } from './reviewer.js';
import { compareVisuals } from '../verification/visual.js';
import { verifyFunctionalBehavior } from '../verification/functional.js';
import { verifyAllLinks } from '../verification/links.js';
import { measurePerformanceAll } from '../verification/performance.js';
import { verifyPageSpeedOptimizations } from '../verification/pagespeed.js';
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
  currentBuildId?: string;
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

const AI_AGENT_WORK_BASE = process.env.AI_AGENT_WORK_DIR || './data/ai-agent';

export async function resumeOptimizationAgent(siteId: string, runId: string): Promise<AgentReport> {
  const [run] = await db.select().from(agentRuns).where(and(eq(agentRuns.siteId, siteId), eq(agentRuns.runId, runId)));
  if (!run || run.status !== 'failed') {
    throw new Error('No resumable run found. Start a new optimization instead.');
  }
  try {
    await fs.access(run.workDir);
  } catch {
    throw new Error('Artifacts expired; cannot resume. Start a new optimization.');
  }
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site ${siteId} not found`);

  await db.update(agentRuns).set({ status: 'running', lastError: null, updatedAt: new Date() }).where(eq(agentRuns.runId, runId));

  const checkpoint = (run.checkpoint || {}) as Record<string, any>;
  return runOptimizationAgentInternal(siteId, {
    resume: true,
    runId,
    workDir: run.workDir,
    inventory: checkpoint.inventory,
    plan: checkpoint.plan,
    pageSpeedData: checkpoint.pageSpeedData,
    currentSettings: checkpoint.currentSettings || {},
    iterationHistory: checkpoint.iterationHistory || [],
    phaseTimings: checkpoint.phaseTimings || {},
    logs: checkpoint.logs || [],
    lastCompletedPhase: (checkpoint.lastCompletedPhase as AgentPhase) || 'analyzing',
  });
}

export async function runOptimizationAgent(siteId: string): Promise<AgentReport> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site ${siteId} not found`);

  const runId = `agent_${nanoid(12)}`;
  const workDir = path.join(AI_AGENT_WORK_BASE, runId);
  await fs.mkdir(workDir, { recursive: true });

  return runOptimizationAgentInternal(siteId, { resume: false, runId, workDir });
}

async function runOptimizationAgentInternal(
  siteId: string,
  opts:
    | { resume: false; runId: string; workDir: string }
    | {
        resume: true;
        runId: string;
        workDir: string;
        inventory?: SiteInventory;
        plan?: { settings?: Record<string, any>; [k: string]: any };
        pageSpeedData?: unknown;
        currentSettings?: Record<string, any>;
        iterationHistory?: IterationResult[];
        phaseTimings?: Record<string, { start: string; end?: string }>;
        logs?: Array<{ timestamp: string; message: string }>;
        lastCompletedPhase: AgentPhase;
      }
): Promise<AgentReport> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site ${siteId} not found`);

  const { runId, workDir } = opts;
  const isResume = opts.resume;

  const now = new Date().toISOString();
  const state: AgentState = {
    siteId,
    runId,
    domain: site.siteUrl,
    startedAt: now,
    phase: isResume ? opts.lastCompletedPhase : 'analyzing',
    iteration: isResume ? (opts.iterationHistory?.length ?? 0) : 0,
    maxIterations: MAX_ITERATIONS,
    logs: isResume ? [...(opts.logs || [])] : [],
    report: null,
    aborted: false,
    phaseTimings: isResume ? { ...opts.phaseTimings } : {},
  };
  activeAgents.set(siteId, state);

  if (!isResume) {
    await db.insert(agentRuns).values({
      id: runId,
      siteId,
      runId,
      status: 'running',
      phase: 'analyzing',
      iteration: 0,
      workDir,
      checkpoint: {},
    });
  }

  const saveCheckpoint = async (checkpointData: {
    inventory?: SiteInventory;
    plan?: { settings?: Record<string, any>; [k: string]: any };
    pageSpeedData?: unknown;
    currentSettings?: Record<string, any>;
    iterationHistory?: IterationResult[];
    lastCompletedPhase?: AgentPhase;
  }) => {
    const cp = state.logs.slice(-100);
    await db.update(agentRuns).set({
      phase: state.phase,
      iteration: state.iteration,
      checkpoint: {
        ...checkpointData,
        phaseTimings: state.phaseTimings,
        logs: cp,
        lastCompletedPhase: checkpointData.lastCompletedPhase ?? state.phase,
      },
      updatedAt: new Date(),
    }).where(eq(agentRuns.runId, runId));
  };

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
    // Clear currentBuildId when leaving building phase
    if (state.phase === 'building' && phase !== 'building') {
      state.currentBuildId = undefined;
    }
    // Start timing for new phase
    state.phase = phase;
    state.phaseTimings[phase] = { start: new Date().toISOString() };
    if (phase !== 'complete' && phase !== 'failed') {
      state.lastSuccessfulPhase = phase;
    }
    buildEmitter.emit(`agent:${siteId}:phase`, phase);
  };

  let inventory!: SiteInventory;
  let plan!: { settings?: Record<string, any>; [k: string]: any };
  let pageSpeedData: unknown = null;
  let currentSettings: Record<string, any>;
  let iterationHistory: IterationResult[];

  if (isResume) {
    inventory = opts.inventory!;
    plan = opts.plan ?? { settings: opts.currentSettings };
    pageSpeedData = opts.pageSpeedData;
    currentSettings = opts.currentSettings || {};
    iterationHistory = opts.iterationHistory || [];
    log('Resuming from previous run...');
  } else {
    currentSettings = {};
    iterationHistory = [];
  }

  let finalVerdict = 'needs-changes';

  try {
    const domain = new URL(site.siteUrl).hostname;
    if (!isResume) {
      log('═══════════════════════════════════════════════');
      log('  METRICS LAB AI OPTIMIZATION AGENT');
      log(`  Site: ${domain}`);
      log(`  Model: Claude Opus 4.6 (claude-opus-4-6)`);
      log(`  Max iterations: ${MAX_ITERATIONS}`);
      log('═══════════════════════════════════════════════');
    }

    // ── PHASE 1: ANALYZE ── (skip if resuming with inventory)
    if (!isResume || !opts.inventory) {
      setPhase('analyzing');
      log('PHASE 1: Analyzing live website...');
      inventory = await analyzeSite(site.siteUrl, workDir, log);
    }
    if (!isResume || !opts.inventory) {
      await saveCheckpoint({ inventory: inventory as any, lastCompletedPhase: 'analyzing' });
    }
    log(`Pages: ${inventory.pageCount}`);
    log(`Scripts: ${inventory.scripts.length}`);
    log(`Interactive elements: ${inventory.interactiveElements.filter(e => e.type !== 'link').length}`);
    log(`jQuery used: ${inventory.jqueryUsed ? 'YES (' + inventory.jqueryDependentScripts.join(', ') + ')' : 'No'}`);
    log(`Baseline screenshots: ${inventory.baselineScreenshots.length}`);
    log(`Baseline behaviors: ${inventory.baselineBehavior.filter(b => b.passed).length} recorded`);

    if (state.aborted) { log('Agent aborted by user.'); setPhase('failed'); return buildReport(state, inventory, []); }

    // ── PHASE 1B: PageSpeed Insights (when available) ── (skip if resuming with plan)
    if ((!isResume || !opts.plan) && isPageSpeedAvailable()) {
      log('Fetching PageSpeed Insights (all categories)...');
      try {
        pageSpeedData = await fetchFullPageSpeedData(site.siteUrl, 'mobile');
        if (pageSpeedData) {
          log(`PageSpeed: Perf=${(pageSpeedData as any).scores.performance}, A11y=${(pageSpeedData as any).scores.accessibility}, SEO=${(pageSpeedData as any).scores.seo}`);
          log(`Optimization plan: ${(pageSpeedData as any).optimizationPlan?.length || 0} actions`);
        }
      } catch (e) {
        log(`PageSpeed fetch failed: ${(e as Error).message} — continuing without`);
      }
    }

    // ── PHASE 1B: AI PLANNING ── (skip if resuming with plan)
    if (!isResume || !opts.plan) {
      setPhase('planning');
      log('PHASE 1B: AI generating optimization plan...');
      plan = await generateOptimizationPlan(inventory, log, pageSpeedData as OptimizationWorkflow | null);
      currentSettings = plan.settings || {};
      await saveCheckpoint({ inventory: inventory as any, plan: plan as any, pageSpeedData, currentSettings, lastCompletedPhase: 'planning' });
    }
    log(`Expected Lighthouse: ${plan.expectedPerformance?.lighthouse || 'N/A'}`);
    log(`Risks: ${plan.risks?.length || 0}`);

    // ── ITERATION LOOP ──
    const startIteration = isResume ? iterationHistory.length + 1 : 1;
    for (let iteration = startIteration; iteration <= MAX_ITERATIONS; iteration++) {
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
        state.currentBuildId = buildId;

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

        log('PageSpeed optimization verification...');
        const pageSpeedResults = await verifyPageSpeedOptimizations(edgeUrl, site.siteUrl, log);
        const psPassed = pageSpeedResults.passed;
        const psFailed = pageSpeedResults.failed;
        const psOverallScore = Math.round((pageSpeedResults.overallScore.performance + pageSpeedResults.overallScore.seo + pageSpeedResults.overallScore.bestPractices) / 3);
        log(`PageSpeed: ${psPassed}/${pageSpeedResults.totalTests} tests passed, overall score ${psOverallScore}/100`);

        const iterResult: IterationResult = {
          iteration, settings: currentSettings, buildId, edgeUrl,
          performance: perfResults, visualComparisons: visualResults,
          functionalTests: funcResults, linkVerification: linkResults,
          pageSpeedVerification: pageSpeedResults,
        };
        iterationHistory.push(iterResult);
        await saveCheckpoint({ inventory: inventory as any, plan: plan as any, pageSpeedData, currentSettings, iterationHistory, lastCompletedPhase: 'verifying' });

        // ── CHECK PASS CONDITIONS ──
        const allVisualPass = visFailed === 0;
        const allFuncPass = fFailed === 0;
        const allLinksPass = lFailed === 0;
        const pageSpeedPass = psFailed === 0 || psOverallScore >= 85; // Pass if no failures or good overall score

        if (allVisualPass && allFuncPass && allLinksPass && pageSpeedPass) {
          log('\nALL CHECKS PASSED!');
          log(`  Visual: All pages match original`);
          log(`  Functional: All ${fPassed} interactive elements work`);
          log(`  Links: All valid`);
          log(`  Performance: Avg ${avgPerf.toFixed(0)}, worst ${worstPerf}`);
          log(`  PageSpeed: ${psPassed}/${pageSpeedResults.totalTests} optimizations verified, score ${psOverallScore}/100`);
          finalVerdict = 'pass';
          break;
        }

        if (allVisualPass && allFuncPass && allLinksPass && avgPerf >= 80 && psOverallScore >= 75) {
          log('Visual + Functional + Links + PageSpeed pass. Performance acceptable.');
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
        await saveCheckpoint({ inventory: inventory as any, plan: plan as any, pageSpeedData, currentSettings, iterationHistory, lastCompletedPhase: 'reviewing' });

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
    try {
      const [existing] = await db.select({ checkpoint: agentRuns.checkpoint }).from(agentRuns).where(eq(agentRuns.runId, runId));
      const prev = (existing?.checkpoint as Record<string, unknown>) || {};
      await db.update(agentRuns).set({
        status: 'failed',
        phase: state.phase,
        iteration: state.iteration,
        lastError: error.message,
        checkpoint: { ...prev, phaseTimings: state.phaseTimings, logs: state.logs.slice(-100), lastCompletedPhase: state.lastSuccessfulPhase ?? state.phase },
        updatedAt: new Date(),
      }).where(eq(agentRuns.runId, runId));
    } catch (dbErr) {
      console.error('[ai-agent] Failed to save checkpoint:', (dbErr as Error).message);
    }
    const report = buildReport(state, null, [], 'failed');
    state.report = report;
    buildEmitter.emit(`agent:${siteId}:complete`, report);
    return report;
  } finally {
    if (state.phase === 'complete') {
      await db.update(agentRuns).set({ status: 'completed', updatedAt: new Date() }).where(eq(agentRuns.runId, runId)).catch(() => {});
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
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
