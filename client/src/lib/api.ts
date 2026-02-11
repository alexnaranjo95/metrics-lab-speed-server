const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('apiKey') || ''}`,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Sites ────────────────────────────────────────────────────────

export interface Site {
  id: string;
  name: string;
  siteUrl: string;
  status: string;
  lastBuildId: string | null;
  lastBuildStatus: string | null;
  lastBuildAt: string | null;
  edgeUrl: string | null;
  pageCount: number | null;
  totalSizeBytes: number | null;
  settings: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Build {
  id: string;
  siteId: string;
  scope: string;
  triggeredBy: string;
  status: string;
  pagesTotal: number | null;
  pagesProcessed: number | null;
  originalSizeBytes: number | null;
  optimizedSizeBytes: number | null;
  jsOriginalBytes: number | null;
  jsOptimizedBytes: number | null;
  cssOriginalBytes: number | null;
  cssOptimizedBytes: number | null;
  imageOriginalBytes: number | null;
  imageOptimizedBytes: number | null;
  facadesApplied: number | null;
  scriptsRemoved: number | null;
  lighthouseScoreBefore: number | null;
  lighthouseScoreAfter: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export const api = {
  // Sites
  getSite: (siteId: string) => fetchJson<Site>(`/sites/${siteId}`),
  getSiteStatus: (siteId: string) => fetchJson<{ site: Site; latestBuild: Build | null }>(`/sites/${siteId}/status`),

  // Builds
  getBuilds: (siteId: string, limit = 20, offset = 0) =>
    fetchJson<{ builds: Build[]; total: number }>(`/sites/${siteId}/builds?limit=${limit}&offset=${offset}`),
  getBuild: (siteId: string, buildId: string) =>
    fetchJson<Build>(`/sites/${siteId}/builds/${buildId}`),
  triggerBuild: (siteId: string, scope: string = 'full') =>
    fetchJson<{ build: Build }>(`/sites/${siteId}/builds`, {
      method: 'POST',
      body: JSON.stringify({ scope }),
    }),

  // Settings
  getSettings: (siteId: string) =>
    fetchJson<{ settings: any; defaults: any }>(`/sites/${siteId}/settings`),
  updateSettings: (siteId: string, settings: Record<string, any>) =>
    fetchJson<{ settings: any }>(`/sites/${siteId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  getSettingsDiff: (siteId: string) =>
    fetchJson<{ diff: Record<string, any>; overrideCount: number }>(`/sites/${siteId}/settings/diff`),
  resetSettings: (siteId: string) =>
    fetchJson<{ settings: any }>(`/sites/${siteId}/settings/reset`, { method: 'POST' }),

  // Asset overrides
  getAssetOverrides: (siteId: string) =>
    fetchJson<{ overrides: any[] }>(`/sites/${siteId}/asset-overrides`),
  createAssetOverride: (siteId: string, data: { urlPattern: string; assetType?: string; settings: any }) =>
    fetchJson<{ override: any }>(`/sites/${siteId}/asset-overrides`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteAssetOverride: (siteId: string, overrideId: string) =>
    fetchJson<{ deleted: boolean }>(`/sites/${siteId}/asset-overrides/${overrideId}`, {
      method: 'DELETE',
    }),
};
