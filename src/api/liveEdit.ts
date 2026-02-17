import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sites } from '../db/schema.js';
import { config } from '../config.js';
import { requireMasterKey } from '../middleware/auth.js';
import { hasWorkspace, getWorkspacePath, ensureWorkspace } from '../liveEdit/workspace.js';
import { applyEdits, getFileTree, readFileContent } from '../liveEdit/editor.js';
import { chatWithEdits, isLiveEditClaudeAvailable } from '../liveEdit/claudeLiveEdit.js';
import { runSpeedAudit, scanForBugs, runVisualDiff } from '../liveEdit/audits.js';
import { deployToCloudflare } from '../pipeline/deploy.js';
import { liveEditEmitter } from '../events/liveEditEmitter.js';

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

      const onThinking = (msg: string) => {
        reply.raw.write(`event: thinking\ndata: ${JSON.stringify({ message: msg })}\n\n`);
      };
      const onPatch = (path: string) => {
        reply.raw.write(`event: patch\ndata: ${JSON.stringify({ path })}\n\n`);
      };
      const onDeploy = (msg: string) => {
        reply.raw.write(`event: deploy\ndata: ${JSON.stringify({ message: msg })}\n\n`);
      };
      const onError = (msg: string) => {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
      };
      const onDone = () => {
        reply.raw.write(`event: done\ndata: {}\n\n`);
      };

      liveEditEmitter.on(`live-edit:${siteId}:thinking`, onThinking);
      liveEditEmitter.on(`live-edit:${siteId}:patch`, onPatch);
      liveEditEmitter.on(`live-edit:${siteId}:deploy`, onDeploy);
      liveEditEmitter.on(`live-edit:${siteId}:error`, onError);
      liveEditEmitter.on(`live-edit:${siteId}:done`, onDone);

      const keepAlive = setInterval(() => reply.raw.write(`: keepalive\n\n`), 15000);
      const cleanup = () => {
        clearInterval(keepAlive);
        liveEditEmitter.off(`live-edit:${siteId}:thinking`, onThinking);
        liveEditEmitter.off(`live-edit:${siteId}:patch`, onPatch);
        liveEditEmitter.off(`live-edit:${siteId}:deploy`, onDeploy);
        liveEditEmitter.off(`live-edit:${siteId}:error`, onError);
        liveEditEmitter.off(`live-edit:${siteId}:done`, onDone);
      };
      req.raw.on('close', cleanup);
    }
  );

  // ─── POST /sites/:siteId/live-edit/chat ──
  app.post<{ Params: { siteId: string }; Body: { message: string } }>(
    '/sites/:siteId/live-edit/chat',
    { preHandler: [requireMasterKey] },
    async (req, reply) => {
      const { siteId } = req.params;
      const { message } = (req.body as { message?: string }) || {};
      if (!message?.trim()) return reply.code(400).send({ error: 'message is required' });

      if (!isLiveEditClaudeAvailable()) {
        return reply.code(400).send({ error: 'ANTHROPIC_API_KEY not configured' });
      }

      const workspacePath = await ensureWorkspace(siteId);
      if (!workspacePath) {
        return reply.code(404).send({ error: 'No workspace. Run a build first.' });
      }

      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!site?.edgeUrl) return reply.code(400).send({ error: 'Site has no edge URL' });

      const files = await getFileTree(siteId);
      const htmlFiles = files.filter(f => f.endsWith('.html')).slice(0, 5);
      let context = `Files: ${files.join(', ')}\n\n`;
      for (const f of htmlFiles) {
        const content = await readFileContent(siteId, f);
        if (content) context += `\n--- ${f} ---\n${content.slice(0, 8000)}\n`;
      }

      const userContent = `Context:\n${context}\n\nUser request: ${message}`;

      let applied = false;
      let deployed = false;
      try {
        liveEditEmitter.emitThinking(siteId, 'Analyzing request...');
        const { edits } = await chatWithEdits(
          LIVE_EDIT_SYSTEM_PROMPT,
          [{ role: 'user', content: userContent }],
          (chunk) => liveEditEmitter.emitThinking(siteId, chunk)
        );

        if (edits && edits.length > 0) {
          liveEditEmitter.emitThinking(siteId, `Applying ${edits.length} edit(s)...`);
          const { applied: editCount, errors } = await applyEdits(siteId, edits, (p) =>
            liveEditEmitter.emitPatch(siteId, p)
          );
          if (errors.length) {
            liveEditEmitter.emitError(siteId, errors.join('; '));
          }
          liveEditEmitter.emitThinking(siteId, `Applied ${editCount} edit(s). Deploying...`);
          const projectName = site.cloudflareProjectName ?? `mls-${siteId}`;
          const deployResult = await deployToCloudflare({
            projectName,
            outputDir: workspacePath,
            siteUrl: site.siteUrl,
          });
          liveEditEmitter.emitDeploy(siteId, 'Deployed to Cloudflare Pages');
          await db.update(sites).set({ edgeUrl: deployResult.url, updatedAt: new Date() }).where(eq(sites.id, siteId));
          applied = true;
          deployed = true;
        }
      } catch (err) {
        liveEditEmitter.emitError(siteId, (err as Error).message);
      }
      liveEditEmitter.emitDone(siteId);

      return reply.send({ applied, deployed });
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
