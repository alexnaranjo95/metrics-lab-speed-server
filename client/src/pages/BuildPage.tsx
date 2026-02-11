import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { BuildViewer } from '@/components/build-viewer/BuildViewer';
import { BuildLogs } from '@/components/build-logs/BuildLogs';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import { ArrowLeft, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';

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
    enabled: !!siteId && !!buildId,
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
            <h1 className="text-xl font-bold">Build {buildId.slice(0, 12)}</h1>
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
