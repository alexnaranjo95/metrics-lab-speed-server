import fs from 'fs/promises';
import path from 'path';

const LIVE_EDIT_DIR = process.env.LIVE_EDIT_WORKSPACE_DIR || './data/live-edit';

export function getWorkspacePath(siteId: string): string {
  return path.join(LIVE_EDIT_DIR, siteId);
}

export async function hasWorkspace(siteId: string): Promise<boolean> {
  const p = getWorkspacePath(siteId);
  try {
    await fs.access(p);
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function ensureWorkspace(siteId: string): Promise<string | null> {
  const p = getWorkspacePath(siteId);
  const exists = await hasWorkspace(siteId);
  return exists ? p : null;
}
