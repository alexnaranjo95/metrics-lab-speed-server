import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { OptimizationChat } from '@/components/optimization-chat/OptimizationChat';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  Loader2,
  Gauge,
  Bug,
  FileDiff,
} from 'lucide-react';

export function LiveEditPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const queryClient = useQueryClient();
  const [screenshotKey, setScreenshotKey] = useState(Date.now());
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hasKey = !!localStorage.getItem('apiKey');

  const { data: status } = useQuery({
    queryKey: ['live-edit-status', siteId],
    queryFn: () => api.getLiveEditStatus(siteId!),
    enabled: !!siteId && hasKey,
  });

  const auditMutation = useMutation({
    mutationFn: (type: 'speed' | 'bugs' | 'visual') => api.liveEditAudit(siteId!, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-edit-status', siteId] });
    },
    onError: (err: Error) => alert(err.message),
  });

  const deployMutation = useMutation({
    mutationFn: () => api.liveEditDeploy(siteId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-edit-status', siteId] });
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      setScreenshotKey(Date.now());
      iframeRef.current?.contentWindow?.location?.reload();
    },
    onError: (err: Error) => alert(err.message),
  });

  const handleDeploySuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['live-edit-status', siteId] });
    queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    setScreenshotKey(Date.now());
    iframeRef.current?.contentWindow?.location?.reload();
  };

  const isPending = auditMutation.isPending || deployMutation.isPending;
  const edgeUrl = status?.edgeUrl;
  const useScreenshotFallback =
    edgeUrl?.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:';

  useEffect(() => {
    if (!useScreenshotFallback || !siteId) return;
    const interval = setInterval(() => setScreenshotKey(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [useScreenshotFallback, siteId]);

  if (!siteId) return <div className="p-8 text-[hsl(var(--muted-foreground))]">No site ID</div>;

  if (!status?.hasWorkspace) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-semibold mb-2">Live Edit Unavailable</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
          Run a build first to enable Live Edit.
        </p>
        <Link
          to={`/sites/${siteId}`}
          className="inline-flex items-center gap-2 text-[hsl(var(--primary))] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Site
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to={`/sites/${siteId}`}
            className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Site
          </Link>
          {edgeUrl && (
            <a
              href={edgeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--primary))] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {edgeUrl.replace(/^https?:\/\//, '').slice(0, 40)}
              {(edgeUrl.length > 45) && '…'}
            </a>
          )}
        </div>
      </div>

      {/* Top row: Chat + Browser (50/50) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Optimization Chat */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden flex flex-col min-h-0">
          <OptimizationChat
            siteId={siteId}
            onDeploy={handleDeploySuccess}
            className="flex-1 min-h-0"
            quickActions={
              <>
                <button
                  type="button"
                  onClick={() => auditMutation.mutate('speed')}
                  disabled={isPending}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium',
                    isPending ? 'opacity-50' : 'bg-amber-600/20 text-amber-700 dark:text-amber-400 hover:bg-amber-600/30'
                  )}
                >
                  {auditMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
                  Speed Audit
                </button>
                <button
                  type="button"
                  onClick={() => auditMutation.mutate('bugs')}
                  disabled={isPending}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium',
                    isPending ? 'opacity-50' : 'bg-rose-600/20 text-rose-700 dark:text-rose-400 hover:bg-rose-600/30'
                  )}
                >
                  {auditMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />}
                  Scan Bugs
                </button>
                <button
                  type="button"
                  onClick={() => auditMutation.mutate('visual')}
                  disabled={isPending}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium',
                    isPending ? 'opacity-50' : 'bg-violet-600/20 text-violet-700 dark:text-violet-400 hover:bg-violet-600/30'
                  )}
                >
                  {auditMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDiff className="h-3.5 w-3.5" />}
                  Visual Diff
                </button>
                <button
                  type="button"
                  onClick={() => deployMutation.mutate()}
                  disabled={isPending}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium',
                    isPending ? 'opacity-50' : 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/30'
                  )}
                >
                  {deployMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Deploy
                </button>
              </>
            }
          />
        </div>

        {/* Browser Preview */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--border))] shrink-0">
            <span className="text-sm font-medium">Browser Preview</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  useScreenshotFallback
                    ? setScreenshotKey(Date.now())
                    : iframeRef.current?.contentWindow?.location?.reload()
                }
                className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              {edgeUrl && (
                <a
                  href={edgeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:underline"
                >
                  Open Live URL
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 bg-gray-100">
            {edgeUrl ? (
              useScreenshotFallback ? (
                <img
                  src={api.getPreviewScreenshotUrl(siteId!, screenshotKey)}
                  alt="Site preview (HTTP)"
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  src={edgeUrl}
                  title="Live site preview"
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              )
            ) : (
              <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
                No edge URL
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
