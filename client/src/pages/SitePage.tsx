import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Build } from '@/lib/api';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import { Play, ExternalLink, CheckCircle, XCircle, Clock, Loader2, Settings, Eye, Bot } from 'lucide-react';

export function SitePage() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const hasKey = !!localStorage.getItem('apiKey');

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['site-status', siteId],
    queryFn: () => api.getSiteStatus(siteId!),
    enabled: !!siteId && hasKey,
    refetchInterval: 5000,
  });

  const { data: buildsData } = useQuery({
    queryKey: ['builds', siteId],
    queryFn: () => api.getBuilds(siteId!, 10),
    enabled: !!siteId && hasKey,
    refetchInterval: 10000,
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      try {
        return await api.triggerBuild(siteId!, 'full');
      } catch (err: any) {
        // If 409 (build in progress), auto-cancel stale builds and retry
        if (err.message?.includes('already in progress')) {
          await api.cancelStaleBuilds(siteId!);
          return await api.triggerBuild(siteId!, 'full');
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['builds', siteId] });
      queryClient.invalidateQueries({ queryKey: ['site-status', siteId] });
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to trigger build');
    },
  });

  if (!siteId) return <div>No site ID provided</div>;
  if (statusLoading) return <div className="animate-pulse p-8 text-center text-[hsl(var(--muted-foreground))]">Loading site...</div>;

  const site = statusData?.site;
  const latestBuild = statusData?.latestBuild;
  const builds = buildsData?.builds || [];

  if (!site) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 text-[hsl(var(--destructive))] mx-auto mb-3" />
        <h2 className="text-lg font-semibold mb-1">Site not found</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">No site with ID "{siteId}"</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Site header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{site.name}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] flex items-center gap-2 mt-1">
            {site.siteUrl}
            {site.edgeUrl && (
              <a href={site.edgeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[hsl(var(--primary))] hover:underline">
                <ExternalLink className="h-3 w-3" />
                Edge URL
              </a>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                await api.startAIOptimize(siteId!);
                navigate(`/sites/${siteId}/ai`);
              } catch (err: any) {
                alert(err.message);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            <Bot className="h-4 w-4" />
            AI Optimize
          </button>
          <button
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending || latestBuild?.status === 'crawling' || latestBuild?.status === 'optimizing' || latestBuild?.status === 'deploying'}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              triggerMutation.isPending
                ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
            )}
          >
            {triggerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Trigger Build
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pages" value={site.pageCount?.toString() || '—'} />
        <StatCard label="Total Size" value={site.totalSizeBytes ? formatBytes(site.totalSizeBytes) : '—'} />
        <StatCard label="Last Build" value={site.lastBuildAt ? formatDate(site.lastBuildAt) : 'Never'} />
        <StatCard label="Status" value={site.lastBuildStatus || 'No builds'} status={site.lastBuildStatus} />
      </div>

      {/* Build history */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="px-4 py-3 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold">Build History</h2>
        </div>
        <div className="divide-y divide-[hsl(var(--border))]">
          {builds.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No builds yet</div>
          )}
          {builds.map((build: Build) => (
            <Link
              key={build.id}
              to={`/sites/${siteId}/builds/${build.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-[hsl(var(--muted))]/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <BuildStatusIcon status={build.status} />
                <div>
                  <span className="text-sm font-medium">{build.id.slice(0, 12)}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))] ml-2">{build.scope} build</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                {build.originalSizeBytes && build.optimizedSizeBytes && (
                  <span className="text-[hsl(var(--success))]">
                    -{Math.round((1 - build.optimizedSizeBytes / build.originalSizeBytes) * 100)}%
                  </span>
                )}
                <span>{formatDate(build.createdAt)}</span>
                <Eye className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Settings panel */}
      <SettingsPanel siteId={siteId} />
    </div>
  );
}

function StatCard({ label, value, status }: { label: string; value: string; status?: string | null }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{label}</div>
      <div className={cn('text-lg font-semibold', status === 'success' && 'text-[hsl(var(--success))]', status === 'failed' && 'text-[hsl(var(--destructive))]')}>
        {value}
      </div>
    </div>
  );
}

function BuildStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success': return <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />;
    case 'failed': return <XCircle className="h-4 w-4 text-[hsl(var(--destructive))]" />;
    case 'queued': return <Clock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />;
    default: return <Loader2 className="h-4 w-4 text-[hsl(var(--primary))] animate-spin" />;
  }
}
