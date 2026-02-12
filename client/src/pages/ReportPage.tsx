import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type PerformanceComparison } from '@/lib/api';
import { ScoreRing, getScoreColor } from '@/components/performance';
import { Loader2, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ReportPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const hasKey = !!localStorage.getItem('apiKey');

  const { data: report, isLoading } = useQuery({
    queryKey: ['performance-report', siteId],
    queryFn: () => api.performance.getReport(siteId!),
    enabled: !!siteId && hasKey,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" />
      </div>
    );
  }

  if (!report) return <div className="p-8 text-center">Report not available</div>;

  const mobile = report.mobile;
  const desktop = report.desktop;
  const impact = report.businessImpact;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Print button (hidden in print) */}
      <div className="print-hidden mb-4 flex justify-end">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
        >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </button>
      </div>

      {/* Report Content */}
      <div className="space-y-8 report-content">
        {/* Header */}
        <div className="border-b-2 border-[hsl(var(--primary))] pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Performance Report</h1>
              <p className="text-[hsl(var(--muted-foreground))] mt-1">{report.site.name}</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-[hsl(var(--primary))]">Metrics Lab Software</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Generated {new Date(report.generatedAt).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-4 text-sm">
            <span><strong>Original:</strong> {report.site.siteUrl}</span>
            <span><strong>Optimized:</strong> {report.site.edgeUrl}</span>
          </div>
        </div>

        {/* Executive Summary */}
        <section>
          <h2 className="text-lg font-bold mb-4">Executive Summary</h2>
          {mobile && (
            <div className="grid grid-cols-3 gap-6 items-center">
              <div className="text-center">
                <div className="text-xs uppercase text-[hsl(var(--muted-foreground))] mb-2">Original</div>
                <ScoreRing score={mobile.original.performance} size={100} />
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold" style={{ color: getScoreColor(mobile.optimized.performance) }}>
                  +{mobile.optimized.performance - mobile.original.performance}
                </div>
                <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Point Improvement</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">({mobile.improvements.score.toFixed(0)}% increase)</div>
              </div>
              <div className="text-center">
                <div className="text-xs uppercase text-[hsl(var(--muted-foreground))] mb-2">Optimized</div>
                <ScoreRing score={mobile.optimized.performance} size={100} />
              </div>
            </div>
          )}
        </section>

        {/* Core Web Vitals Table */}
        {mobile && (
          <section>
            <h2 className="text-lg font-bold mb-4">Core Web Vitals (Mobile)</h2>
            <MetricsTable comparison={mobile} />
          </section>
        )}

        {desktop && (
          <section>
            <h2 className="text-lg font-bold mb-4">Core Web Vitals (Desktop)</h2>
            <MetricsTable comparison={desktop} />
          </section>
        )}

        {/* Business Impact */}
        {impact && (
          <section>
            <h2 className="text-lg font-bold mb-4">Estimated Business Impact</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ImpactBox label="Conversion Rate" value={`+${impact.conversionRateIncrease.toFixed(1)}%`} />
              <ImpactBox label="Bounce Rate" value={`-${impact.bounceRateReduction.toFixed(1)}%`} />
              <ImpactBox label="Page Views" value={`+${impact.pageViewsIncrease.toFixed(1)}%`} />
              <ImpactBox label="SEO Impact" value={impact.seoRankingImpact === 'positive' ? 'Positive' : 'Neutral'} />
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3">
              Based on Google research: a 1-second improvement in LCP yields approximately 7% improvement in conversion rates.
              Load time reduction: {(impact.loadTimeReductionMs / 1000).toFixed(1)}s.
            </p>
          </section>
        )}

        {/* Trend Summary */}
        {report.trends.length > 1 && (
          <section>
            <h2 className="text-lg font-bold mb-4">Performance Trend (Last 30 Days)</h2>
            <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[hsl(var(--muted))]">
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-right px-4 py-2 font-medium">Original</th>
                    <th className="text-right px-4 py-2 font-medium">Optimized</th>
                    <th className="text-right px-4 py-2 font-medium">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {report.trends.slice(-10).map((t, i) => (
                    <tr key={i} className="border-t border-[hsl(var(--border))]">
                      <td className="px-4 py-2">{new Date(t.testedAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-right">{t.originalScore ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-medium">{t.optimizedScore ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-[hsl(var(--success))]">
                        {t.originalScore != null && t.optimizedScore != null
                          ? `+${t.optimizedScore - t.originalScore}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Recommendations */}
        {mobile && mobile.opportunitiesOptimized.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-4">Remaining Optimization Opportunities</h2>
            <div className="space-y-2">
              {mobile.opportunitiesOptimized.map((opp, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[hsl(var(--border))]/50">
                  <span className="text-sm">{i + 1}. {opp.title}</span>
                  {opp.savings > 0 && (
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      ~{(opp.savings / 1000).toFixed(1)}s potential savings
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="border-t-2 border-[hsl(var(--border))] pt-4 text-center">
          <div className="text-sm font-medium">Metrics Lab Software</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Performance Optimization &amp; Monitoring Platform
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Metrics Table Component ──────────────────────────────────────

function MetricsTable({ comparison }: { comparison: PerformanceComparison }) {
  const metrics = [
    { name: 'Performance Score', before: comparison.original.performance, after: comparison.optimized.performance, unit: '', improvement: comparison.improvements.score },
    { name: 'LCP', before: comparison.original.lcp, after: comparison.optimized.lcp, unit: 'ms', improvement: comparison.improvements.lcp },
    { name: 'TBT', before: comparison.original.tbt, after: comparison.optimized.tbt, unit: 'ms', improvement: comparison.improvements.tbt },
    { name: 'CLS', before: comparison.original.cls, after: comparison.optimized.cls, unit: '', improvement: comparison.improvements.cls },
    { name: 'FCP', before: comparison.original.fcp, after: comparison.optimized.fcp, unit: 'ms', improvement: comparison.improvements.fcp },
    { name: 'Speed Index', before: comparison.original.si, after: comparison.optimized.si, unit: 'ms', improvement: comparison.improvements.si },
    { name: 'TTFB', before: comparison.original.ttfb, after: comparison.optimized.ttfb, unit: 'ms', improvement: 0 },
  ];

  return (
    <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[hsl(var(--muted))]">
            <th className="text-left px-4 py-2 font-medium">Metric</th>
            <th className="text-right px-4 py-2 font-medium">Original</th>
            <th className="text-right px-4 py-2 font-medium">Optimized</th>
            <th className="text-right px-4 py-2 font-medium">Improvement</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(m => {
            const fmtVal = (v: number) => {
              if (m.unit === 'ms' && v > 1000) return `${(v / 1000).toFixed(1)}s`;
              if (m.unit === 'ms') return `${Math.round(v)}ms`;
              if (m.name === 'CLS') return v.toFixed(3);
              return String(Math.round(v));
            };

            return (
              <tr key={m.name} className="border-t border-[hsl(var(--border))]">
                <td className="px-4 py-2 font-medium">{m.name}</td>
                <td className="px-4 py-2 text-right">{fmtVal(m.before)}</td>
                <td className="px-4 py-2 text-right font-medium">{fmtVal(m.after)}</td>
                <td className={cn(
                  'px-4 py-2 text-right font-medium',
                  m.improvement > 0 ? 'text-[hsl(var(--success))]' : m.improvement < 0 ? 'text-[hsl(var(--destructive))]' : ''
                )}>
                  {m.improvement !== 0 ? `${m.improvement > 0 ? '-' : '+'}${Math.abs(m.improvement).toFixed(0)}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ImpactBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[hsl(var(--border))] rounded-lg p-3 text-center">
      <div className="text-xs text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="text-lg font-bold text-[hsl(var(--success))]">{value}</div>
    </div>
  );
}
