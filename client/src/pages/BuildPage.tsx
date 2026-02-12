import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { BuildViewer } from '@/components/build-viewer/BuildViewer';
import { BuildLogs } from '@/components/build-logs/BuildLogs';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import { ArrowLeft, CheckCircle, XCircle, Loader2, Clock, BarChart3 } from 'lucide-react';

const PHASES = ['crawl', 'images', 'css', 'js', 'html', 'fonts', 'deploy'];

const STATUS_MAP: Record<string, string> = {
  queued: 'crawl',
  crawling: 'crawl',
  optimizing: 'images',
  deploying: 'deploy',
  success: 'deploy',
  failed: '',
};

export function BuildPage() {
  const { siteId, buildId } = useParams<{ siteId: string; buildId: string }>();

  const [pollEnabled, setPollEnabled] = useState(true);

  const { data: build, isLoading } = useQuery({
    queryKey: ['build', siteId, buildId],
    queryFn: async () => {
      const data = await api.getBuild(siteId!, buildId!);
      if (data.status === 'success' || data.status === 'failed') {
        setPollEnabled(false);
      }
      return data;
    },
    enabled: !!siteId && !!buildId && !!localStorage.getItem('apiKey'),
    refetchInterval: pollEnabled ? 3000 : false,
  });

  if (!siteId || !buildId) return <div>Missing parameters</div>;
  if (isLoading) return <div className="animate-pulse p-8 text-center text-[hsl(var(--muted-foreground))]">Loading build...</div>;
  if (!build) return <div>Build not found</div>;

  const isActive = !['success', 'failed'].includes(build.status);
  const currentPhase = STATUS_MAP[build.status] || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={`/sites/${siteId}`} className="p-1.5 rounded-md hover:bg-[hsl(var(--muted))]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Build {build.displayName ?? buildId.replace('build_', '').slice(0, 12)}</h1>
            <StatusBadge status={build.status} />
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {build.scope} build · {build.triggeredBy} · {formatDate(build.createdAt)}
          </p>
        </div>
      </div>

      {/* Phase progress bar */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
        <div className="flex items-center gap-1">
          {PHASES.map((phase, i) => {
            const phaseIdx = PHASES.indexOf(currentPhase);
            const isCompleted = phaseIdx > i || build.status === 'success';
            const isCurrent = phase === currentPhase && isActive;

            return (
              <div key={phase} className="flex items-center flex-1">
                <div className={cn(
                  'flex-1 h-1.5 rounded-full transition-colors',
                  isCompleted ? 'bg-[hsl(var(--success))]' :
                  isCurrent ? 'bg-[hsl(var(--primary))] animate-pulse' :
                  'bg-[hsl(var(--muted))]'
                )} />
                {i < PHASES.length - 1 && <div className="w-1" />}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
          {PHASES.map(p => <span key={p}>{p}</span>)}
        </div>
      </div>

      {/* Stats row */}
      {(build.originalSizeBytes || build.pagesTotal) && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {build.pagesTotal != null && (
            <MiniStat label="Pages" value={`${build.pagesProcessed || 0}/${build.pagesTotal}`} />
          )}
          {build.originalSizeBytes != null && build.optimizedSizeBytes != null && (
            <>
              <MiniStat label="Original" value={formatBytes(build.originalSizeBytes)} />
              <MiniStat label="Optimized" value={formatBytes(build.optimizedSizeBytes)} />
              <MiniStat
                label="Savings"
                value={`${Math.round((1 - build.optimizedSizeBytes / build.originalSizeBytes) * 100)}%`}
                highlight
              />
            </>
          )}
          {build.lighthouseScoreAfter != null && (
            <MiniStat label="Lighthouse" value={`${build.lighthouseScoreAfter}`} highlight />
          )}
        </div>
      )}

      {/* Build viewer + logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BuildViewer buildId={buildId} enabled={isActive} />
        <BuildLogs buildId={buildId} enabled={true} />
      </div>

      {/* Before / After Comparison — shown when build is complete */}
      {build.status === 'success' && (build.originalSizeBytes || build.lighthouseScoreBefore != null) && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
          <div className="px-5 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
            <h3 className="text-sm font-semibold">Performance Comparison</h3>
            <Link
              to={`/sites/${siteId}/performance`}
              className="flex items-center gap-1.5 text-xs text-[hsl(var(--primary))] hover:underline"
            >
              <BarChart3 className="h-3.5 w-3.5" /> View Full Performance Dashboard
            </Link>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {build.lighthouseScoreBefore != null && build.lighthouseScoreAfter != null && (
                <ComparisonCard
                  label="Lighthouse Score"
                  before={String(build.lighthouseScoreBefore)}
                  after={String(build.lighthouseScoreAfter)}
                  improved={build.lighthouseScoreAfter > build.lighthouseScoreBefore}
                />
              )}
              {build.originalSizeBytes != null && build.optimizedSizeBytes != null && (
                <ComparisonCard
                  label="Page Size"
                  before={formatBytes(build.originalSizeBytes)}
                  after={formatBytes(build.optimizedSizeBytes)}
                  improved={build.optimizedSizeBytes < build.originalSizeBytes}
                  delta={`-${Math.round((1 - build.optimizedSizeBytes / build.originalSizeBytes) * 100)}%`}
                />
              )}
              {build.facadesApplied != null && build.facadesApplied > 0 && (
                <ComparisonCard
                  label="Video Facades"
                  before="Heavy iframes"
                  after={`${build.facadesApplied} replaced`}
                  improved={true}
                />
              )}
              {build.scriptsRemoved != null && build.scriptsRemoved > 0 && (
                <ComparisonCard
                  label="Scripts Removed"
                  before="Loaded"
                  after={`${build.scriptsRemoved} removed`}
                  improved={true}
                />
              )}
            </div>

            {/* Detailed asset breakdown */}
            {(build.cssOriginalBytes || build.jsOriginalBytes || build.imageOriginalBytes) && (
              <div className="mt-4 pt-4 border-t border-[hsl(var(--border))]">
                <h4 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-3 uppercase tracking-wide">Asset Breakdown</h4>
                <div className="space-y-2">
                  {build.cssOriginalBytes != null && build.cssOptimizedBytes != null && build.cssOriginalBytes > 0 && (
                    <BreakdownBar label="CSS" before={build.cssOriginalBytes} after={build.cssOptimizedBytes} />
                  )}
                  {build.jsOriginalBytes != null && build.jsOptimizedBytes != null && build.jsOriginalBytes > 0 && (
                    <BreakdownBar label="JavaScript" before={build.jsOriginalBytes} after={build.jsOptimizedBytes} />
                  )}
                  {build.imageOriginalBytes != null && build.imageOptimizedBytes != null && build.imageOriginalBytes > 0 && (
                    <BreakdownBar label="Images" before={build.imageOriginalBytes} after={build.imageOptimizedBytes} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error display */}
      {build.errorMessage && (
        <div className="rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5 p-4">
          <h3 className="text-sm font-semibold text-[hsl(var(--destructive))] mb-1">Error</h3>
          <p className="text-sm text-[hsl(var(--destructive))]">{build.errorMessage}</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
    failed: 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]',
    queued: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  };
  const icons: Record<string, any> = {
    success: CheckCircle,
    failed: XCircle,
    queued: Clock,
  };
  const Icon = icons[status] || Loader2;
  const isSpinning = !['success', 'failed', 'queued'].includes(status);

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', styles[status] || 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]')}>
      <Icon className={cn('h-3 w-3', isSpinning && 'animate-spin')} />
      {status}
    </span>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className={cn('text-sm font-semibold', highlight && 'text-[hsl(var(--success))]')}>{value}</div>
    </div>
  );
}

function ComparisonCard({ label, before, after, improved, delta }: {
  label: string; before: string; after: string; improved: boolean; delta?: string;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] p-3">
      <div className="text-xs text-[hsl(var(--muted-foreground))] mb-2">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-[hsl(var(--muted-foreground))] line-through">{before}</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">&rarr;</span>
        <span className={cn('text-sm font-semibold', improved ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--foreground))]')}>
          {after}
        </span>
      </div>
      {delta && (
        <div className="text-xs font-medium text-[hsl(var(--success))] mt-1">{delta}</div>
      )}
    </div>
  );
}

function BreakdownBar({ label, before, after }: { label: string; before: number; after: number }) {
  const pct = Math.max(0, Math.min(100, (after / before) * 100));
  const savings = Math.round((1 - after / before) * 100);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-20 shrink-0">{label}</span>
      <div className="flex-1 h-4 bg-[hsl(var(--muted))] rounded-full overflow-hidden relative">
        <div
          className="h-full bg-[hsl(var(--success))] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs w-32 shrink-0 text-right text-[hsl(var(--muted-foreground))]">
        {formatBytes(before)} &rarr; {formatBytes(after)}
        <span className="text-[hsl(var(--success))] ml-1 font-medium">-{savings}%</span>
      </span>
    </div>
  );
}
