import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Build } from '@/lib/api';
import { cn, formatBytes, formatTimeAgo, formatDuration } from '@/lib/utils';
import {
  ArrowLeft, Play, Loader2, CheckCircle, XCircle, Clock, Eye,
} from 'lucide-react';

export function BuildHistoryPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const queryClient = useQueryClient();

  const { data: siteData } = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => api.getSite(siteId!),
    enabled: !!siteId,
  });

  const [pollEnabled, setPollEnabled] = useState(true);
  const { data, isLoading } = useQuery({
    queryKey: ['builds', siteId],
    queryFn: async () => {
      const result = await api.getBuilds(siteId!, 50);
      const hasActive = result.builds.some(
        (b: Build) => !['success', 'failed'].includes(b.status)
      );
      if (!hasActive) setPollEnabled(false);
      else setPollEnabled(true);
      return result;
    },
    enabled: !!siteId,
    refetchInterval: pollEnabled ? 5000 : false,
  });

  const triggerMutation = useMutation({
    mutationFn: () => api.triggerBuild(siteId!, 'full'),
    onSuccess: () => {
      setPollEnabled(true);
      queryClient.invalidateQueries({ queryKey: ['builds', siteId] });
    },
  });

  if (!siteId) return null;

  const builds = data?.builds || [];
  const domain = siteData ? new URL(siteData.siteUrl).hostname : siteId;
  const hasActive = builds.some((b: Build) => !['success', 'failed'].includes(b.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/sites/${siteId}`} className="p-1.5 rounded-md hover:bg-[hsl(var(--muted))]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Build History</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{domain}</p>
          </div>
        </div>
        <button
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending || hasActive}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            triggerMutation.isPending || hasActive
              ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
              : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
          )}
        >
          {triggerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Trigger Build
        </button>
      </div>

      {/* Builds list */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {isLoading && (
          <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading builds...
          </div>
        )}

        {!isLoading && builds.length === 0 && (
          <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
            No builds yet. Trigger your first build to get started.
          </div>
        )}

        <div className="divide-y divide-[hsl(var(--border))]">
          {builds.map((build: Build) => (
            <BuildCard key={build.id} build={build} siteId={siteId} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BuildCard({ build, siteId }: { build: Build; siteId: string }) {
  const isActive = !['success', 'failed'].includes(build.status);
  const savings = build.originalSizeBytes && build.optimizedSizeBytes
    ? Math.round((1 - build.optimizedSizeBytes / build.originalSizeBytes) * 100)
    : null;

  return (
    <Link
      to={`/sites/${siteId}/builds/${build.id}`}
      className="flex items-center justify-between px-5 py-4 hover:bg-[hsl(var(--muted))]/20 transition-colors"
    >
      <div className="flex items-center gap-4 min-w-0">
        <BuildStatusIcon status={build.status} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium font-mono">{build.id}</span>
            <StatusBadge status={build.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            <span>{build.scope} build</span>
            <span>{formatTimeAgo(build.createdAt)}</span>
            {build.startedAt && (
              <span>Duration: {formatDuration(build.startedAt, build.completedAt)}</span>
            )}
            {build.pagesTotal != null && (
              <span>{build.pagesProcessed || 0}/{build.pagesTotal} pages</span>
            )}
          </div>
          {build.status === 'failed' && build.errorMessage && (
            <p className="text-xs text-[hsl(var(--destructive))] mt-1 truncate max-w-lg">{build.errorMessage}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {savings != null && build.status === 'success' && (
          <div className="text-right">
            <div className="text-sm font-semibold text-[hsl(var(--success))]">-{savings}%</div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
              {formatBytes(build.originalSizeBytes!)} &rarr; {formatBytes(build.optimizedSizeBytes!)}
            </div>
          </div>
        )}
        <Eye className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
      </div>
    </Link>
  );
}

function BuildStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success': return <CheckCircle className="h-5 w-5 text-[hsl(var(--success))]" />;
    case 'failed': return <XCircle className="h-5 w-5 text-[hsl(var(--destructive))]" />;
    case 'queued': return <Clock className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />;
    default: return <Loader2 className="h-5 w-5 text-[hsl(var(--primary))] animate-spin" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === 'success' ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]' :
    status === 'failed' ? 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]' :
    status === 'queued' ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]' :
    'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]';

  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', style)}>
      {status}
    </span>
  );
}
