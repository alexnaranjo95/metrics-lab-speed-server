import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PerformanceComparison } from '@/lib/api';
import { ScoreRing, MetricCard, CWV_THRESHOLDS, TrendChart, BusinessImpactPanel, AlertRuleForm } from '@/components/performance';
import { usePerformanceSSE } from '@/hooks/usePerformanceSSE';
import { cn, formatBytes } from '@/lib/utils';
import {
  ArrowLeft, Play, Loader2, Download, FileText, ChevronDown, ChevronUp,
  Smartphone, Monitor, ArrowRight, Zap, Bell, BarChart3, Target,
} from 'lucide-react';

export function PerformancePage() {
  const { siteId } = useParams<{ siteId: string }>();
  const queryClient = useQueryClient();
  const hasKey = !!localStorage.getItem('apiKey');

  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [days, setDays] = useState(30);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [trendMetric, setTrendMetric] = useState<'score' | 'lcp' | 'fcp' | 'si' | 'tbt' | 'cls'>('score');

  // SSE for live updates
  const [sseEnabled, setSseEnabled] = useState(false);
  const { testStatus, progress } = usePerformanceSSE(siteId, sseEnabled);

  // Data queries
  const { data: comparisonData, isLoading } = useQuery({
    queryKey: ['performance-comparison', siteId],
    queryFn: () => api.performance.getComparison(siteId!),
    enabled: !!siteId && hasKey,
    refetchInterval: testStatus === 'running' ? 5000 : false,
  });

  const { data: timeSeriesData } = useQuery({
    queryKey: ['performance-timeseries', siteId, strategy, days],
    queryFn: () => api.performance.getTimeSeries(siteId!, strategy, days),
    enabled: !!siteId && hasKey,
  });

  const { data: impactData } = useQuery({
    queryKey: ['performance-impact', siteId],
    queryFn: () => api.performance.getBusinessImpact(siteId!),
    enabled: !!siteId && hasKey,
  });

  const { data: alertData } = useQuery({
    queryKey: ['performance-alerts', siteId],
    queryFn: () => api.performance.getAlertRules(siteId!),
    enabled: !!siteId && hasKey && showAlerts,
  });

  const { data: siteStatus } = useQuery({
    queryKey: ['site-status', siteId],
    queryFn: () => api.getSiteStatus(siteId!),
    enabled: !!siteId && hasKey,
  });

  // Mutations
  const triggerTest = useMutation({
    mutationFn: () => api.performance.triggerTest(siteId!),
    onSuccess: () => {
      setSseEnabled(true);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['performance-comparison', siteId] });
        queryClient.invalidateQueries({ queryKey: ['performance-timeseries', siteId] });
        queryClient.invalidateQueries({ queryKey: ['performance-impact', siteId] });
      }, 5000);
    },
  });

  const createAlert = useMutation({
    mutationFn: (data: any) => api.performance.createAlertRule(siteId!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['performance-alerts', siteId] }),
  });

  const toggleAlert = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      api.performance.updateAlertRule(siteId!, ruleId, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['performance-alerts', siteId] }),
  });

  const deleteAlert = useMutation({
    mutationFn: (ruleId: string) => api.performance.deleteAlertRule(siteId!, ruleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['performance-alerts', siteId] }),
  });

  if (!siteId) return <div>Missing parameters</div>;

  const comparison = strategy === 'mobile' ? comparisonData?.mobile : comparisonData?.desktop;
  const site = siteStatus?.site;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link to={`/sites/${siteId}`} className="p-1.5 rounded-md hover:bg-[hsl(var(--muted))] shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[hsl(var(--primary))]" />
              Performance Comparison
            </h1>
            {site && (
              <p className="text-sm text-[hsl(var(--muted-foreground))] truncate">
                {site.siteUrl} <ArrowRight className="inline h-3 w-3 mx-1" /> {site.edgeUrl || 'No edge URL'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => triggerTest.mutate()}
            disabled={triggerTest.isPending || testStatus === 'running'}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              triggerTest.isPending || testStatus === 'running'
                ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
            )}
          >
            {triggerTest.isPending || testStatus === 'running'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Play className="h-4 w-4" />
            }
            {testStatus === 'running' ? (progress?.message || 'Testing...') : 'Run Test'}
          </button>
        </div>
      </div>

      {/* Strategy + Time Range Toggles */}
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex rounded-md border border-[hsl(var(--border))] overflow-hidden">
          <button
            onClick={() => setStrategy('mobile')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-sm', strategy === 'mobile' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'hover:bg-[hsl(var(--muted))]')}
          >
            <Smartphone className="h-3.5 w-3.5" /> Mobile
          </button>
          <button
            onClick={() => setStrategy('desktop')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-sm', strategy === 'desktop' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'hover:bg-[hsl(var(--muted))]')}
          >
            <Monitor className="h-3.5 w-3.5" /> Desktop
          </button>
        </div>
        <div className="inline-flex rounded-md border border-[hsl(var(--border))] overflow-hidden">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={cn('px-3 py-1.5 text-sm', days === d ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'hover:bg-[hsl(var(--muted))]')}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" />
        </div>
      )}

      {/* No data state */}
      {!isLoading && !comparison && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center">
          <Target className="h-12 w-12 text-[hsl(var(--muted-foreground))] mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1">No Performance Data Yet</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
            Run a performance test to see before/after comparison results.
          </p>
          <button
            onClick={() => triggerTest.mutate()}
            disabled={triggerTest.isPending || !site?.edgeUrl}
            className="px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
          >
            {!site?.edgeUrl ? 'Build site first' : 'Run Performance Test'}
          </button>
        </div>
      )}

      {/* Score Comparison Hero */}
      {comparison && (
        <ScoreComparisonHero comparison={comparison} />
      )}

      {/* Core Web Vitals Grid */}
      {comparison && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
          <div className="px-5 py-3 border-b border-[hsl(var(--border))]">
            <h3 className="text-sm font-semibold">Core Web Vitals</h3>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard name="LCP" fullName="Largest Contentful Paint"
              before={comparison.original.lcp} after={comparison.optimized.lcp}
              improvement={comparison.improvements.lcp} unit="s" thresholds={CWV_THRESHOLDS.LCP} />
            <MetricCard name="TBT" fullName="Total Blocking Time"
              before={comparison.original.tbt} after={comparison.optimized.tbt}
              improvement={comparison.improvements.tbt} unit="ms" thresholds={CWV_THRESHOLDS.TBT} />
            <MetricCard name="CLS" fullName="Cumulative Layout Shift"
              before={comparison.original.cls} after={comparison.optimized.cls}
              improvement={comparison.improvements.cls} unit="" thresholds={CWV_THRESHOLDS.CLS} />
            <MetricCard name="FCP" fullName="First Contentful Paint"
              before={comparison.original.fcp} after={comparison.optimized.fcp}
              improvement={comparison.improvements.fcp} unit="s" thresholds={CWV_THRESHOLDS.FCP} />
            <MetricCard name="SI" fullName="Speed Index"
              before={comparison.original.si} after={comparison.optimized.si}
              improvement={comparison.improvements.si} unit="s" thresholds={CWV_THRESHOLDS.SI} />
          </div>
        </div>
      )}

      {/* Trend Charts */}
      {timeSeriesData && timeSeriesData.dataPoints.length > 0 && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
          <div className="px-5 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
            <h3 className="text-sm font-semibold">Performance Trends</h3>
            <select value={trendMetric} onChange={e => setTrendMetric(e.target.value as any)}
              className="text-xs rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1">
              <option value="score">Score</option>
              <option value="lcp">LCP</option>
              <option value="fcp">FCP</option>
              <option value="si">Speed Index</option>
              <option value="tbt">TBT</option>
              <option value="cls">CLS</option>
            </select>
          </div>
          <div className="p-4">
            <TrendChart data={timeSeriesData.dataPoints} metric={trendMetric} height={280} />
          </div>
        </div>
      )}

      {/* Business Impact */}
      {impactData && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
          <div className="px-5 py-3 border-b border-[hsl(var(--border))]">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4" /> Business Impact
            </h3>
          </div>
          <div className="p-4">
            <BusinessImpactPanel impact={impactData.impact} />
          </div>
        </div>
      )}

      {/* Detailed Diagnostics (collapsible) */}
      {comparison && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-[hsl(var(--muted))]/30 transition-colors"
          >
            <h3 className="text-sm font-semibold">Detailed Diagnostics</h3>
            {showDiagnostics ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showDiagnostics && (
            <div className="px-5 pb-4 border-t border-[hsl(var(--border))] pt-4 space-y-4">
              {/* Payload savings */}
              {(comparison.payloadSavings.totalKb ?? 0) > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2 uppercase tracking-wide">Payload Reduction</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <MiniStat label="Total Saved" value={`${comparison.payloadSavings.totalKb} KB`} />
                    <MiniStat label="Images" value={`${comparison.payloadSavings.imageKb ?? 0} KB`} />
                    <MiniStat label="JavaScript" value={`${comparison.payloadSavings.jsKb ?? 0} KB`} />
                    <MiniStat label="CSS" value={`${comparison.payloadSavings.cssKb ?? 0} KB`} />
                  </div>
                </div>
              )}

              {/* Opportunities */}
              {comparison.opportunitiesOptimized.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2 uppercase tracking-wide">
                    Remaining Opportunities (Optimized Site)
                  </h4>
                  <div className="space-y-1">
                    {comparison.opportunitiesOptimized.map((opp, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-[hsl(var(--border))]/50 last:border-0">
                        <span>{opp.title}</span>
                        {opp.savings > 0 && (
                          <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0 ml-2">
                            ~{(opp.savings / 1000).toFixed(1)}s savings
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Alert Configuration (collapsible) */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
        <button
          onClick={() => setShowAlerts(!showAlerts)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-[hsl(var(--muted))]/30 transition-colors"
        >
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4" /> Alert Rules
          </h3>
          {showAlerts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showAlerts && (
          <div className="px-5 pb-4 border-t border-[hsl(var(--border))] pt-4">
            <AlertRuleForm
              rules={alertData?.rules || []}
              onCreateRule={(data) => createAlert.mutate(data)}
              onToggleRule={(ruleId, enabled) => toggleAlert.mutate({ ruleId, enabled })}
              onDeleteRule={(ruleId) => deleteAlert.mutate(ruleId)}
            />
          </div>
        )}
      </div>

      {/* Export Actions */}
      <div className="flex flex-wrap gap-2">
        <a
          href={api.performance.exportCsv(siteId, days, strategy) as string}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </a>
        <Link
          to={`/sites/${siteId}/performance/report`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
        >
          <FileText className="h-3.5 w-3.5" /> Generate Report
        </Link>
      </div>
    </div>
  );
}

// ─── Score Comparison Hero ────────────────────────────────────────

function ScoreComparisonHero({ comparison }: { comparison: PerformanceComparison }) {
  const scoreDelta = comparison.optimized.performance - comparison.original.performance;
  const improvementPct = comparison.improvements.score;

  let badge = 'No Change';
  let badgeColor = 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]';
  if (improvementPct > 100) { badge = 'MUCH FASTER'; badgeColor = 'text-[hsl(var(--success))] bg-[hsl(var(--success))]/10'; }
  else if (improvementPct > 30) { badge = 'FASTER'; badgeColor = 'text-[hsl(var(--success))] bg-[hsl(var(--success))]/10'; }
  else if (improvementPct > 0) { badge = 'Improved'; badgeColor = 'text-[hsl(var(--success))] bg-[hsl(var(--success))]/10'; }
  else if (improvementPct < -10) { badge = 'Regressed'; badgeColor = 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10'; }

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        {/* Before */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-3">Before</div>
          <ScoreRing score={comparison.original.performance} label={comparison.originalDomain} />
        </div>

        {/* Improvement */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Improvement</div>
          <div className={cn('text-3xl font-bold', scoreDelta > 0 ? 'text-[hsl(var(--success))]' : scoreDelta < 0 ? 'text-[hsl(var(--destructive))]' : '')}>
            {scoreDelta > 0 ? '+' : ''}{scoreDelta}
          </div>
          <span className={cn('px-3 py-1 rounded-full text-sm font-medium', badgeColor)}>
            {badge}
          </span>
          {improvementPct !== 0 && (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {improvementPct > 0 ? '+' : ''}{improvementPct.toFixed(0)}% change
            </span>
          )}
        </div>

        {/* After */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-3">After</div>
          <ScoreRing score={comparison.optimized.performance} label={comparison.optimizedDomain} />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
