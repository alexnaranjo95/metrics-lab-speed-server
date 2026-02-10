import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { hashContent } from '../utils/crypto.js';

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
      console.log(`Created Cloudflare Pages project: ${projectName}`);
      return;
    }

    const data = await response.json() as { errors?: Array<{ code: number; message: string }> };

    // 8000007 = project already exists
    if (data.errors?.some(e => e.code === 8000007)) {
      console.log(`Cloudflare Pages project already exists: ${projectName}`);
      return;
    }

    throw new Error(`Failed to create Pages project: ${JSON.stringify(data.errors)}`);
  } catch (err) {
    if ((err as Error).message.includes('already exists')) return;
    throw err;
  }
}

/**
 * Recursively collect all files in a directory.
 */
async function collectFiles(dir: string, baseDir: string): Promise<Array<{ path: string; content: Buffer }>> {
  const files: Array<{ path: string; content: Buffer }> = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name as string);
    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const content = await fs.readFile(fullPath);
      const relativePath = '/' + path.relative(baseDir, fullPath);
      files.push({ path: relativePath, content });
    }
    }
  } catch {
    return files;
  }

  return files;
}

/**
 * Deploy files to Cloudflare Pages using the Direct Upload API.
 */
export async function deployToPages(
  projectName: string,
  outputDir: string
): Promise<{ url: string; deploymentId: string; filesUploaded: number; totalSizeBytes: number }> {
  const accountId = getAccountId();

  // Collect all files from the output directory
  const files = await collectFiles(outputDir, outputDir);

  if (files.length === 0) {
    throw new Error('No files to deploy');
  }

  // Build the manifest: { "/path/to/file": hash }
  const manifest: Record<string, string> = {};
  const filesByHash = new Map<string, Buffer>();
  let totalSizeBytes = 0;

  for (const file of files) {
    const hash = hashContent(file.content.toString('base64'));
    manifest[file.path] = hash;
    filesByHash.set(hash, file.content);
    totalSizeBytes += file.content.length;
  }

  // Step 1: Create deployment and upload manifest
  const formData = new FormData();
  formData.append('manifest', JSON.stringify(manifest));

  // Add each file as a blob
  for (const [hash, content] of filesByHash) {
    formData.append(hash, new Blob([new Uint8Array(content)]));
  }

  const response = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/pages/projects/${projectName}/deployments`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Cloudflare deployment failed: ${response.status} ${errorData}`);
  }

  const data = await response.json() as {
    result?: {
      id: string;
      url: string;
    };
  };

  const deploymentId = data.result?.id ?? 'unknown';
  const url = data.result?.url ?? `https://${projectName}.pages.dev`;

  return {
    url,
    deploymentId,
    filesUploaded: files.length,
    totalSizeBytes,
  };
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
      console.log(`Deleted Cloudflare Pages project: ${projectName}`);
      return;
    }

    const data = await response.text();
    console.warn(`Failed to delete Pages project ${projectName}: ${data}`);
  } catch (err) {
    console.warn(`Error deleting Pages project ${projectName}:`, (err as Error).message);
  }
}
