import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

function getHeaders(): Record<string, string> {
  if (!config.CLOUDFLARE_API_TOKEN) {
    throw new Error('CLOUDFLARE_API_TOKEN is not configured');
  }
  return {
    'Authorization': `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function getAccountId(): string {
  if (!config.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID is not configured');
  }
  return config.CLOUDFLARE_ACCOUNT_ID;
}

/**
 * Create a Cloudflare Pages project (idempotent — ignores if already exists).
 */
export async function createPagesProject(projectName: string): Promise<void> {
  const accountId = getAccountId();

  try {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${accountId}/pages/projects`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: projectName,
          production_branch: 'main',
        }),
      }
    );

    if (response.ok) {
      console.log(`[deploy] Created Cloudflare Pages project: ${projectName}`);
      return;
    }

    const data = await response.json() as { errors?: Array<{ code: number; message: string }> };

    // 8000007 = project already exists
    if (data.errors?.some(e => e.code === 8000007)) {
      console.log(`[deploy] Cloudflare Pages project already exists: ${projectName}`);
      return;
    }

    throw new Error(`Failed to create Pages project: ${JSON.stringify(data.errors)}`);
  } catch (err) {
    if ((err as Error).message.includes('already exists')) return;
    throw err;
  }
}

/**
 * Count files recursively in a directory.
 */
async function countFiles(dir: string): Promise<{ count: number; totalBytes: number }> {
  let count = 0;
  let totalBytes = 0;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name as string);
      if (entry.isDirectory()) {
        const sub = await countFiles(fullPath);
        count += sub.count;
        totalBytes += sub.totalBytes;
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        count++;
        totalBytes += stat.size;
      }
    }
  } catch {
    // directory doesn't exist or can't be read
  }

  return { count, totalBytes };
}

/**
 * Deploy files to Cloudflare Pages using wrangler CLI.
 * Wrangler handles the full Direct Upload API flow correctly:
 * 1. Get upload token
 * 2. Upload files in batches
 * 3. Upsert hashes
 * 4. Create deployment with manifest
 */
export async function deployToPages(
  projectName: string,
  outputDir: string
): Promise<{ url: string; deploymentId: string; filesUploaded: number; totalSizeBytes: number }> {
  const accountId = getAccountId();

  // Count files first for reporting
  const { count: filesCount, totalBytes } = await countFiles(outputDir);

  if (filesCount === 0) {
    throw new Error('No files to deploy');
  }

  console.log(`[deploy] Deploying ${filesCount} files (${totalBytes} bytes) to Cloudflare Pages project: ${projectName}`);
  console.log(`[deploy] Output directory: ${outputDir}`);

  // List first few files for debugging
  try {
    const topEntries = await fs.readdir(outputDir);
    console.log(`[deploy] Top-level entries in output dir: ${topEntries.join(', ')}`);
  } catch (err) {
    console.error(`[deploy] Cannot read output dir:`, (err as Error).message);
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      'npx',
      [
        'wrangler',
        'pages',
        'deploy',
        outputDir,
        '--project-name', projectName,
        '--branch', 'main',
        '--commit-message', `Build deployment at ${new Date().toISOString()}`,
      ],
      {
        env: {
          ...process.env,
          CLOUDFLARE_ACCOUNT_ID: accountId,
          CLOUDFLARE_API_TOKEN: config.CLOUDFLARE_API_TOKEN,
        },
        timeout: 5 * 60 * 1000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for output
      }
    );

    console.log(`[deploy] Wrangler stdout:\n${stdout}`);
    if (stderr) {
      console.log(`[deploy] Wrangler stderr:\n${stderr}`);
    }

    // Parse deployment URL from wrangler output
    // Wrangler outputs lines like:
    //   ✨ Deployment complete! Take a peek over at https://abc123.project-name.pages.dev
    //   or: https://abc123.project-name.pages.dev
    let url = `https://${projectName}.pages.dev`;
    let deploymentId = 'unknown';

    const urlMatch = stdout.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev/i);
    if (urlMatch) {
      url = urlMatch[0];
      // Extract deployment ID from the subdomain (e.g., "abc123" from "abc123.project-name.pages.dev")
      const idMatch = url.match(/https:\/\/([a-z0-9]+)\./i);
      if (idMatch) {
        deploymentId = idMatch[1];
      }
    }

    console.log(`[deploy] Deployment complete: url=${url}, deploymentId=${deploymentId}, files=${filesCount}`);

    return {
      url,
      deploymentId,
      filesUploaded: filesCount,
      totalSizeBytes: totalBytes,
    };
  } catch (err: any) {
    // execFileAsync throws with stdout/stderr on the error object
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    console.error(`[deploy] Wrangler deployment failed!`);
    console.error(`[deploy] Exit code: ${err.code}`);
    console.error(`[deploy] stdout:\n${stdout}`);
    console.error(`[deploy] stderr:\n${stderr}`);
    throw new Error(`Cloudflare deployment failed: ${err.message}\nstdout: ${stdout}\nstderr: ${stderr}`);
  }
}

/**
 * Delete a Cloudflare Pages project.
 */
export async function deletePagesProject(projectName: string): Promise<void> {
  const accountId = getAccountId();

  try {
    const response = await fetch(
      `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}`,
      {
        method: 'DELETE',
        headers: getHeaders(),
      }
    );

    if (response.ok || response.status === 404) {
      console.log(`[deploy] Deleted Cloudflare Pages project: ${projectName}`);
      return;
    }

    const data = await response.text();
    console.warn(`[deploy] Failed to delete Pages project ${projectName}: ${data}`);
  } catch (err) {
    console.warn(`[deploy] Error deleting Pages project ${projectName}:`, (err as Error).message);
  }
}
