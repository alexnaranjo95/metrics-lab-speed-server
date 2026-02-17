const base = import.meta.env.BASE_URL || '/';
export const API_BASE = base === '/' ? '/api' : `${base.replace(/\/$/, '')}/api`;

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
  displayName?: string;
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
      currentBuildId?: string;
      canResume?: boolean;
      resumableRunId?: string;
    }>(`/sites/${siteId}/ai/status`),
  resumeAgent: (siteId: string, runId?: string) =>
    fetchJson<{ message: string; jobId: string; siteId: string; runId: string }>(
      `/sites/${siteId}/ai/resume`,
      { method: 'POST', body: JSON.stringify(runId ? { runId } : {}) }
    ),
  getAgentReport: (siteId: string) =>
    fetchJson<{ report: any }>(`/sites/${siteId}/ai/report`),
  stopAgent: (siteId: string) =>
    fetchJson<{ stopped: boolean }>(`/sites/${siteId}/ai/stop`, { method: 'POST', body: '{}' }),

  // Live Edit
  getLiveEditStatus: (siteId: string) =>
    fetchJson<{ hasWorkspace: boolean; edgeUrl: string | null; canEdit: boolean }>(
      `/sites/${siteId}/live-edit/status`
    ),
  liveEditChat: (siteId: string, message: string) =>
    fetchJson<{ applied: boolean; deployed?: boolean }>(`/sites/${siteId}/live-edit/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  liveEditAudit: (siteId: string, type: 'speed' | 'bugs' | 'visual') =>
    fetchJson<any>(`/sites/${siteId}/live-edit/audit`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),
  liveEditDeploy: (siteId: string) =>
    fetchJson<{ url: string; deployed: boolean }>(`/sites/${siteId}/live-edit/deploy`, {
      method: 'POST',
      body: '{}',
    }),

  // Performance Comparison
  performance: {
    getComparison: (siteId: string) =>
      fetchJson<{ mobile: PerformanceComparison | null; desktop: PerformanceComparison | null }>(
        `/sites/${siteId}/performance/comparison`
      ),
    getHistory: (siteId: string, opts?: { strategy?: string; from?: string; to?: string; limit?: number; offset?: number }) => {
      const params = new URLSearchParams();
      if (opts?.strategy) params.set('strategy', opts.strategy);
      if (opts?.from) params.set('from', opts.from);
      if (opts?.to) params.set('to', opts.to);
      if (opts?.limit) params.set('limit', String(opts.limit));
      if (opts?.offset) params.set('offset', String(opts.offset));
      return fetchJson<{ comparisons: PerformanceComparison[]; total: number }>(
        `/sites/${siteId}/performance/comparison/history?${params}`
      );
    },
    getTimeSeries: (siteId: string, strategy = 'mobile', days = 30) =>
      fetchJson<{ strategy: string; days: number; dataPoints: TimeSeriesPoint[] }>(
        `/sites/${siteId}/performance/metrics/timeseries?strategy=${strategy}&days=${days}`
      ),
    triggerTest: (siteId: string) =>
      fetchJson<{ testId: string; status: string; message: string }>(
        `/sites/${siteId}/performance/test`, { method: 'POST', body: '{}' }
      ),
    getTestStatus: (siteId: string, testId: string) =>
      fetchJson<{ testId: string; status: string; progress: any }>(
        `/sites/${siteId}/performance/test/${testId}`
      ),
    getBusinessImpact: (siteId: string) =>
      fetchJson<{ impact: BusinessImpact; comparison: PerformanceComparison }>(
        `/sites/${siteId}/performance/business-impact`
      ),
    getReport: (siteId: string) =>
      fetchJson<PerformanceReport>(`/sites/${siteId}/performance/report`),
    exportCsv: (siteId: string, days = 90, strategy?: string) => {
      const params = new URLSearchParams({ days: String(days) });
      if (strategy) params.set('strategy', strategy);
      return `${API_BASE}/sites/${siteId}/performance/export/csv?${params}`;
    },
    exportJson: (siteId: string, days = 90, strategy?: string) => {
      const params = new URLSearchParams({ days: String(days) });
      if (strategy) params.set('strategy', strategy);
      return fetchJson<{ comparisons: PerformanceComparison[]; exported: number }>(
        `/sites/${siteId}/performance/export/json?${params}`
      );
    },
    getMonitor: (siteId: string) =>
      fetchJson<{ monitor: PerformanceMonitor | null }>(`/sites/${siteId}/performance/monitor`),
    updateMonitor: (siteId: string, data: Partial<PerformanceMonitor>) =>
      fetchJson<{ monitor: PerformanceMonitor }>(`/sites/${siteId}/performance/monitor`, {
        method: 'PUT', body: JSON.stringify(data),
      }),
    getAlertRules: (siteId: string) =>
      fetchJson<{ rules: AlertRule[] }>(`/sites/${siteId}/performance/alerts`),
    createAlertRule: (siteId: string, data: Omit<AlertRule, 'id' | 'createdAt' | 'lastTriggeredAt'>) =>
      fetchJson<{ rule: AlertRule }>(`/sites/${siteId}/performance/alerts`, {
        method: 'POST', body: JSON.stringify(data),
      }),
    updateAlertRule: (siteId: string, ruleId: string, data: Partial<AlertRule>) =>
      fetchJson<{ rule: AlertRule }>(`/sites/${siteId}/performance/alerts/${ruleId}`, {
        method: 'PUT', body: JSON.stringify(data),
      }),
    deleteAlertRule: (siteId: string, ruleId: string) =>
      fetchJson<{ deleted: boolean }>(`/sites/${siteId}/performance/alerts/${ruleId}`, {
        method: 'DELETE',
      }),
    getAlertLog: (siteId: string, limit = 50) =>
      fetchJson<{ logs: AlertLogEntry[] }>(`/sites/${siteId}/performance/alerts/log?limit=${limit}`),
  },
};

// ─── Performance Types ────────────────────────────────────────────

export interface PerformanceMetrics {
  performance: number;
  lcp: number;
  tbt: number;
  cls: number;
  fcp: number;
  si: number;
  ttfb: number;
}

export interface PerformanceComparison {
  id: string;
  siteId: string;
  buildId: string | null;
  testedAt: string;
  strategy: 'mobile' | 'desktop';
  originalDomain: string;
  optimizedDomain: string;
  original: PerformanceMetrics;
  optimized: PerformanceMetrics;
  improvements: {
    score: number;
    lcp: number;
    tbt: number;
    cls: number;
    fcp: number;
    si: number;
  };
  payloadSavings: {
    totalKb: number | null;
    imageKb: number | null;
    jsKb: number | null;
    cssKb: number | null;
  };
  fieldDataOriginal: any;
  fieldDataOptimized: any;
  opportunitiesOriginal: Array<{ id: string; title: string; savings: number }>;
  opportunitiesOptimized: Array<{ id: string; title: string; savings: number }>;
}

export interface TimeSeriesPoint {
  testedAt: string;
  originalScore: number | null;
  optimizedScore: number | null;
  originalLcp: number | null;
  optimizedLcp: number | null;
  originalFcp: number | null;
  optimizedFcp: number | null;
  originalSi: number | null;
  optimizedSi: number | null;
  originalTbt: number | null;
  optimizedTbt: number | null;
  originalCls: number | null;
  optimizedCls: number | null;
}

export interface BusinessImpact {
  conversionRateIncrease: number;
  bounceRateReduction: number;
  pageViewsIncrease: number;
  seoRankingImpact: 'positive' | 'neutral' | 'negative';
  loadTimeReductionMs: number;
  scoreImprovement: number;
}

export interface PerformanceReport {
  site: { id: string; name: string; siteUrl: string; edgeUrl: string | null };
  generatedAt: string;
  mobile: PerformanceComparison | null;
  desktop: PerformanceComparison | null;
  trends: Array<{ testedAt: string; originalScore: number | null; optimizedScore: number | null }>;
  businessImpact: BusinessImpact | null;
}

export interface PerformanceMonitor {
  id: string;
  siteId: string;
  frequency: string;
  enabled: boolean;
  alertOnRegression: boolean;
  regressionThreshold: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  siteId: string;
  metric: string;
  condition: string;
  value: number;
  timeWindow: string;
  severity: string;
  channels: string[];
  enabled: boolean;
  webhookUrl: string | null;
  slackWebhookUrl: string | null;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface AlertLogEntry {
  id: string;
  siteId: string;
  ruleId: string | null;
  message: string;
  severity: string;
  data: any;
  createdAt: string;
}
