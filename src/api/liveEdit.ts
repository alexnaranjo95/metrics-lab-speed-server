import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { chromium } from 'playwright';
import { db } from '../db/index.js';
import { sites } from '../db/schema.js';
import { config } from '../config.js';
import { requireMasterKey } from '../middleware/auth.js';
import { hasWorkspace, getWorkspacePath, ensureWorkspace } from '../liveEdit/workspace.js';
import { applyEdits, getFileTree, readFileContent } from '../liveEdit/editor.js';
import { chatWithEdits, chatWithPlan, isLiveEditClaudeAvailable, type PlanOutput } from '../liveEdit/claudeLiveEdit.js';
import { runSpeedAudit, scanForBugs, runVisualDiff } from '../liveEdit/audits.js';
import { deployToCloudflare } from '../pipeline/deploy.js';
import { liveEditEmitter } from '../events/liveEditEmitter.js';

const planStore = new Map<string, PlanOutput>();

const LIVE_EDIT_SYSTEM_PROMPT = `You are a code editor for a static website. The user will describe bugs, design changes, or performance issues.
You have access to the site's HTML, CSS, and JS source files. Respond with precise file edits.

Output format:
1. First, briefly explain what you're going to do (your reasoning).
2. Then output a JSON block with edits in this format:

\`\`\`json
[
  { "path": "index.html", "newContent": "..." },
  { "path": "assets/main.css", "newContent": "..." }
]
\`\`\`

- path: relative path from the workspace root (e.g. index.html, assets/style.css)
- newContent: the complete new file content (replace entire file)

Only include files you actually need to change. Keep edits minimal and targeted.`;

export const liveEditRoutes: FastifyPluginAsync = async (app) => {
  const authOrToken = async (req: any, reply: any): Promise<boolean> => {
    const authHeader = req.headers?.authorization;
    const tokenParam = (req.query as { token?: string })?.token;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenParam;
    if (config.MASTER_API_KEY && token !== config.MASTER_API_KEY) {
      reply.code(401).send({ error: 'Unauthorized' });
      return false;
    }
    return true;
  };

  // ─── GET /sites/:siteId/live-edit/status ──
  app.get<{ Params: { siteId: string } }>(
    '/sites/:siteId/live-edit/status',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!site) return reply.code(404).send({ error: 'Site not found' });

      const ws = await hasWorkspace(siteId);
      return reply.send({
        hasWorkspace: ws,
        edgeUrl: site.edgeUrl,
        canEdit: ws && !!site.edgeUrl,
      });
    }
  );

  // ─── GET /sites/:siteId/live-edit/files ──
  app.get<{ Params: { siteId: string } }>(
    '/sites/:siteId/live-edit/files',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const ws = await hasWorkspace(siteId);
      if (!ws) return reply.code(404).send({ error: 'No workspace. Run a build first.' });

      const files = await getFileTree(siteId);
      return reply.send({ files });
    }
  );

  // ─── GET /sites/:siteId/preview-screenshot ──
  app.get<{ Params: { siteId: string }; Querystring: { token?: string; t?: string } }>(
    '/sites/:siteId/preview-screenshot',
    async (req, reply) => {
      if (!(await authOrToken(req, reply))) return;
      const { siteId } = req.params;

      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!site?.edgeUrl) return reply.code(404).send({ error: 'Site has no edge URL' });

      let browser;
      try {
        browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--allow-insecure-localhost'],
        });
        const context = await browser.newContext({
          viewport: { width: 1280, height: 720 },
          ignoreHTTPSErrors: true,
        });
        const page = await context.newPage();
        await page.goto(site.edgeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const buffer = await page.screenshot({ type: 'png' });
        await browser.close();

        return reply
          .header('Content-Type', 'image/png')
          .header('Cache-Control', 'no-store, no-cache')
          .send(buffer);
      } catch (err) {
        if (browser) await browser.close().catch(() => {});
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  // ─── GET /sites/:siteId/live-edit/stream (SSE) ──
  app.get<{ Params: { siteId: string }; Querystring: { token?: string } }>(
    '/sites/:siteId/live-edit/stream',
    async (req, reply) => {
      if (!(await authOrToken(req, reply))) return;
      const { siteId } = req.params;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const writeEvent = (event: string, data: object) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const onThinking = (msg: string) => writeEvent('thinking', { message: msg });
      const onMessage = (data: { role: string; content: string; streaming?: boolean }) => writeEvent('message', data);
      const onPlan = (data: object) => writeEvent('plan', data);
      const onStepStart = (data: { step: string; description: string }) => writeEvent('step_start', data);
      const onStepComplete = (data: { step: string; result: string }) => writeEvent('step_complete', data);
      const onPatch = (path: string) => writeEvent('patch', { path });
      const onDeploy = (msg: string) => writeEvent('deploy', { message: msg });
      const onVerificationStart = () => writeEvent('verification_start', {});
      const onVerificationResult = (data: object) => writeEvent('verification_result', data);
      const onError = (msg: string) => writeEvent('error', { message: msg });
      const onDone = () => writeEvent('done', {});

      liveEditEmitter.on(`live-edit:${siteId}:thinking`, onThinking);
      liveEditEmitter.on(`live-edit:${siteId}:message`, onMessage);
      liveEditEmitter.on(`live-edit:${siteId}:plan`, onPlan);
      liveEditEmitter.on(`live-edit:${siteId}:step_start`, onStepStart);
      liveEditEmitter.on(`live-edit:${siteId}:step_complete`, onStepComplete);
      liveEditEmitter.on(`live-edit:${siteId}:patch`, onPatch);
      liveEditEmitter.on(`live-edit:${siteId}:deploy`, onDeploy);
      liveEditEmitter.on(`live-edit:${siteId}:verification_start`, onVerificationStart);
      liveEditEmitter.on(`live-edit:${siteId}:verification_result`, onVerificationResult);
      liveEditEmitter.on(`live-edit:${siteId}:error`, onError);
      liveEditEmitter.on(`live-edit:${siteId}:done`, onDone);

      const keepAlive = setInterval(() => reply.raw.write(`: keepalive\n\n`), 15000);
      const cleanup = () => {
        clearInterval(keepAlive);
        liveEditEmitter.off(`live-edit:${siteId}:thinking`, onThinking);
        liveEditEmitter.off(`live-edit:${siteId}:message`, onMessage);
        liveEditEmitter.off(`live-edit:${siteId}:plan`, onPlan);
        liveEditEmitter.off(`live-edit:${siteId}:step_start`, onStepStart);
        liveEditEmitter.off(`live-edit:${siteId}:step_complete`, onStepComplete);
        liveEditEmitter.off(`live-edit:${siteId}:patch`, onPatch);
        liveEditEmitter.off(`live-edit:${siteId}:deploy`, onDeploy);
        liveEditEmitter.off(`live-edit:${siteId}:verification_start`, onVerificationStart);
        liveEditEmitter.off(`live-edit:${siteId}:verification_result`, onVerificationResult);
        liveEditEmitter.off(`live-edit:${siteId}:error`, onError);
        liveEditEmitter.off(`live-edit:${siteId}:done`, onDone);
      };
      req.raw.on('close', cleanup);
    }
  );

  // ─── POST /sites/:siteId/live-edit/chat ──
  app.post<{ Params: { siteId: string }; Body: { message?: string; mode?: 'plan' | 'execute'; planId?: string; scope?: string[] } }>(
    '/sites/:siteId/live-edit/chat',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const body = req.body as { message?: string; mode?: 'plan' | 'execute'; planId?: string; scope?: string[] };
      const { message, mode = 'plan', planId, scope } = body;

      if (!isLiveEditClaudeAvailable()) {
        return reply.code(400).send({ error: 'ANTHROPIC_API_KEY not configured' });
      }

      const workspacePath = await ensureWorkspace(siteId);
      if (!workspacePath) {
        return reply.code(404).send({ error: 'No workspace. Run a build first.' });
      }

      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!site?.edgeUrl) return reply.code(400).send({ error: 'Site has no edge URL' });

      if (mode === 'execute') {
        const stored = planStore.get(siteId);
        if (!stored) return reply.code(400).send({ error: 'No plan to execute. Create a plan first.' });
        if (planId && stored.planId !== planId) {
          return reply.code(400).send({ error: 'Plan no longer valid. Create a new plan.' });
        }

        const { edits } = stored;
        let applied = false;
        let deployed = false;

        try {
          if (edits.length > 0) {
            liveEditEmitter.emitStepStart(siteId, 'apply', `Applying ${edits.length} edit(s)...`);
            const { applied: editCount, errors } = await applyEdits(siteId, edits, (p) =>
              liveEditEmitter.emitPatch(siteId, p)
            );
            liveEditEmitter.emitStepComplete(siteId, 'apply', errors.length ? `Applied ${editCount}, ${errors.length} error(s)` : `Applied ${editCount} edit(s)`);
            if (errors.length) liveEditEmitter.emitError(siteId, errors.join('; '));

            liveEditEmitter.emitStepStart(siteId, 'deploy', 'Deploying to Cloudflare Pages...');
            const projectName = site.cloudflareProjectName ?? `mls-${siteId}`;
            const deployResult = await deployToCloudflare({
              projectName,
              outputDir: workspacePath,
              siteUrl: site.siteUrl,
            });
            await db.update(sites).set({ edgeUrl: deployResult.url, updatedAt: new Date() }).where(eq(sites.id, siteId));
            liveEditEmitter.emitStepComplete(siteId, 'deploy', `Live at ${deployResult.url}`);
            liveEditEmitter.emitDeploy(siteId, 'Deployed to Cloudflare Pages');
            applied = true;
            deployed = true;
          }

          const verifiedUrl = deployed ? (await db.query.sites.findFirst({ where: eq(sites.id, siteId) }))?.edgeUrl : site.edgeUrl;
          if (verifiedUrl) {
            liveEditEmitter.emitVerificationStart(siteId);
            const { runVerificationSuite } = await import('../liveEdit/verification.js');
            const verification = await runVerificationSuite(verifiedUrl, site.siteUrl, (msg) =>
              liveEditEmitter.emitThinking(siteId, msg)
            );
            liveEditEmitter.emitVerificationResult(siteId, verification);
          }
        } catch (err) {
          liveEditEmitter.emitError(siteId, (err as Error).message);
        }
        liveEditEmitter.emitDone(siteId);
        return reply.send({ applied, deployed, planId: stored.planId });
      }

      if (!message?.trim()) return reply.code(400).send({ error: 'message is required' });

      const allFiles = await getFileTree(siteId);
      const scopeSet = scope?.length ? new Set(scope) : null;
      const relevantFiles = scopeSet ? allFiles.filter((f) => scopeSet.has(f)) : allFiles;
      const htmlFiles = relevantFiles.filter((f) => f.endsWith('.html'));
      const toLoad = htmlFiles.length > 0 ? htmlFiles.slice(0, 8) : relevantFiles.filter((f) => /\.(html|css|js)$/.test(f)).slice(0, 5);
      let context = `Files in scope: ${toLoad.length ? toLoad.join(', ') : relevantFiles.slice(0, 20).join(', ')}${relevantFiles.length > 20 ? '...' : ''}\n\n`;
      for (const f of toLoad) {
        const content = await readFileContent(siteId, f);
        if (content) context += `\n--- ${f} ---\n${content.slice(0, 8000)}\n`;
      }
      if (scope?.length) context = `[Edit scope: ${scope.join(', ')}. Only modify these files.]\n\n` + context;

      const userContent = `Context:\n${context}\n\nUser request: ${message}`;

      try {
        liveEditEmitter.emitThinking(siteId, 'Analyzing request and creating plan...');
        const { text, plan } = await chatWithPlan(
          [{ role: 'user', content: userContent }],
          (chunk) => liveEditEmitter.emitThinking(siteId, chunk)
        );

        if (plan) {
          planStore.set(siteId, plan);
          liveEditEmitter.emitPlan(siteId, {
            issues: plan.issues,
            improvements: plan.improvements,
            rationale: plan.rationale,
            edits: plan.edits,
            planId: plan.planId,
          });
        }
      } catch (err) {
        liveEditEmitter.emitError(siteId, (err as Error).message);
      }
      liveEditEmitter.emitDone(siteId);

      return reply.send({ mode: 'plan', planId: planStore.get(siteId)?.planId });
    }
  );

  // ─── POST /sites/:siteId/live-edit/audit ──
  app.post<{ Params: { siteId: string }; Body: { type: 'speed' | 'bugs' | 'visual' } }>(
    '/sites/:siteId/live-edit/audit',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const { type } = (req.body as { type?: string }) || {};
      if (!['speed', 'bugs', 'visual'].includes(type || '')) {
        return reply.code(400).send({ error: 'type must be speed, bugs, or visual' });
      }

      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!site?.edgeUrl) return reply.code(400).send({ error: 'Site has no edge URL' });

      const onLog = (msg: string) => liveEditEmitter.emitThinking(siteId, msg);

      if (type === 'speed') {
        const result = await runSpeedAudit(site.edgeUrl, onLog);
        liveEditEmitter.emitDone(siteId);
        return reply.send(result);
      }
      if (type === 'bugs') {
        const result = await scanForBugs(site.edgeUrl, onLog);
        liveEditEmitter.emitDone(siteId);
        return reply.send(result);
      }
      const result = await runVisualDiff(siteId, site.edgeUrl, onLog);
      liveEditEmitter.emitDone(siteId);
      return reply.send(result);
    }
  );

  // ─── POST /sites/:siteId/live-edit/deploy ──
  app.post<{ Params: { siteId: string } }>(
    '/sites/:siteId/live-edit/deploy',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const workspacePath = await ensureWorkspace(siteId);
      if (!workspacePath) return reply.code(404).send({ error: 'No workspace' });

      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!site) return reply.code(404).send({ error: 'Site not found' });

      try {
        liveEditEmitter.emitDeploy(siteId, 'Deploying to Cloudflare Pages...');
        const projectName = site.cloudflareProjectName ?? `mls-${siteId}`;
        const result = await deployToCloudflare({
          projectName,
          outputDir: workspacePath,
          siteUrl: site.siteUrl,
        });
        await db.update(sites).set({ edgeUrl: result.url, updatedAt: new Date() }).where(eq(sites.id, siteId));
        liveEditEmitter.emitDeploy(siteId, `Live at ${result.url}`);
        liveEditEmitter.emitDone(siteId);
        return reply.send({ url: result.url, deployed: true });
      } catch (err) {
        liveEditEmitter.emitError(siteId, (err as Error).message);
        liveEditEmitter.emitDone(siteId);
        throw err;
      }
    }
  );
};
