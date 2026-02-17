import fs from 'fs/promises';
import path from 'path';
import { getWorkspacePath } from './workspace.js';

function isPathSafe(workspaceRoot: string, filePath: string): boolean {
  const resolved = path.resolve(workspaceRoot, filePath);
  return resolved.startsWith(workspaceRoot) && !resolved.includes('..');
}

export async function applyEdits(
  siteId: string,
  edits: Array<{ path: string; newContent: string }>,
  onPatch?: (path: string) => void
): Promise<{ applied: number; errors: string[] }> {
  const workspaceRoot = getWorkspacePath(siteId);
  let applied = 0;
  const errors: string[] = [];

  for (const edit of edits) {
    const relPath = edit.path.startsWith('/') ? edit.path.slice(1) : edit.path;
    if (!isPathSafe(workspaceRoot, relPath)) {
      errors.push(`Invalid path: ${edit.path}`);
      continue;
    }
    const fullPath = path.join(workspaceRoot, relPath);
    try {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, edit.newContent, 'utf-8');
      applied++;
      onPatch?.(relPath);
    } catch (err) {
      errors.push(`${relPath}: ${(err as Error).message}`);
    }
  }
  return { applied, errors };
}

export async function getFileTree(siteId: string): Promise<string[]> {
  const workspaceRoot = getWorkspacePath(siteId);
  const files: string[] = [];

  async function walk(dir: string, base = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = path.join(base, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        await walk(path.join(dir, e.name), rel);
      } else {
        files.push(rel);
      }
    }
  }
  await walk(workspaceRoot);
  return files;
}

export async function readFileContent(siteId: string, filePath: string, maxBytes = 50000): Promise<string | null> {
  const workspaceRoot = getWorkspacePath(siteId);
  const relPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  if (!isPathSafe(workspaceRoot, relPath)) return null;
  try {
    const content = await fs.readFile(path.join(workspaceRoot, relPath), 'utf-8');
    return content.length > maxBytes ? content.slice(0, maxBytes) + '\n// ... [truncated]' : content;
  } catch {
    return null;
  }
}
