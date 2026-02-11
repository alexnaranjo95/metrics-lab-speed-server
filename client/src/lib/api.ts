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

export interface SiteWithBuild {
  id: string;
  name: string;
  siteUrl: string;
  status: string;
  edgeUrl: string | null;
  cloudflareProjectName: string | null;
  pageCount: number | null;
  totalSizeBytes: number | null;
  lastBuild: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    originalSizeBytes: number | null;
    optimizedSizeBytes: number | null;
    lighthouseScoreBefore: number | null;
    lighthouseScoreAfter: number | null;
    errorMessage: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export const api = {
  // Sites
  listSites: () => fetchJson<{ sites: SiteWithBuild[] }>('/sites'),
  getSite: (siteId: string) => fetchJson<Site>(`/sites/${siteId}`),
  getSiteStatus: (siteId: string) => fetchJson<{ site: Site; latestBuild: Build | null }>(`/sites/${siteId}/status`),
  createSite: (name: string, siteUrl: string) =>
    fetchJson<{ id: string; name: string; site_url: string; webhookSecret: string }>('/sites', {
      method: 'POST',
      body: JSON.stringify({ name, site_url: siteUrl }),
    }),

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
  cancelStaleBuilds: (siteId: string) =>
    fetchJson<{ cancelled: number; buildIds?: string[] }>(`/sites/${siteId}/builds/cancel-stale`, {
      method: 'POST', body: '{}',
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
    fetchJson<{ settings: any }>(`/sites/${siteId}/settings/reset`, { method: 'POST', body: '{}' }),
  getSettingsDefaults: (siteId: string) =>
    fetchJson<{ defaults: any }>(`/sites/${siteId}/settings/defaults`),
  getSettingsHistory: (siteId: string) =>
    fetchJson<{ history: Array<{ id: string; settings: any; changedBy: string; createdAt: string }> }>(`/sites/${siteId}/settings/history`),
  rollbackSettings: (siteId: string, historyId: string) =>
    fetchJson<{ settings: any }>(`/sites/${siteId}/settings/rollback/${historyId}`, { method: 'POST', body: '{}' }),

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

  // AI
  getAIUsage: () =>
    fetchJson<{
      available: boolean;
      currentMonth: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCost: number;
    }>('/ai/usage'),
  getAIStatus: () =>
    fetchJson<{ available: boolean; model: string }>('/ai/status'),

  // AI Agent
  startAIOptimize: (siteId: string) =>
    fetchJson<{ message: string; jobId: string; siteId: string }>(`/sites/${siteId}/ai/optimize`, { method: 'POST', body: '{}' }),
  getAgentStatus: (siteId: string) =>
    fetchJson<{
      running: boolean;
      runId?: string;
      domain?: string;
      startedAt?: string;
      phase?: string;
      iteration?: number;
      maxIterations?: number;
      phaseTimings?: Record<string, { start: string; end?: string }>;
      lastError?: string;
      logCount?: number;
      recentLogs?: Array<{ timestamp: string; message: string }>;
    }>(`/sites/${siteId}/ai/status`),
  getAgentReport: (siteId: string) =>
    fetchJson<{ report: any }>(`/sites/${siteId}/ai/report`),
  stopAgent: (siteId: string) =>
    fetchJson<{ stopped: boolean }>(`/sites/${siteId}/ai/stop`, { method: 'POST', body: '{}' }),
};
