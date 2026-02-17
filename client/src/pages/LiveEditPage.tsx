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
  ChevronDown,
  ChevronRight,
  FileCode,
} from 'lucide-react';

export function LiveEditPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const queryClient = useQueryClient();
  const [screenshotKey, setScreenshotKey] = useState(Date.now());
  const [scopeOpen, setScopeOpen] = useState(false);
  const [editScope, setEditScope] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hasKey = !!localStorage.getItem('apiKey');

  const { data: status } = useQuery({
    queryKey: ['live-edit-status', siteId],
    queryFn: () => api.getLiveEditStatus(siteId!),
    enabled: !!siteId && hasKey,
  });

  const { data: filesData } = useQuery({
    queryKey: ['live-edit-files', siteId],
    queryFn: () => api.getLiveEditFiles(siteId!),
    enabled: !!siteId && hasKey && !!status?.hasWorkspace,
  });

  const htmlFiles = (filesData?.files ?? []).filter((f) => f.endsWith('.html')).sort();

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
      <div className="p-8 text-center max-w-md mx-auto">
        <h2 className="text-lg font-semibold mb-2">Live Edit Unavailable</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6">
          Run a build first to create an editable workspace. The build output will be copied locally for AI-assisted editing.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to={`/sites/${siteId}/builds`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
          >
            View Builds & Run Build
          </Link>
          <Link
            to={`/sites/${siteId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Site
          </Link>
        </div>
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
          {/* Edit Scope selector */}
          {htmlFiles.length > 0 && (
            <div className="border-b border-[hsl(var(--border))]">
              <button
                type="button"
                onClick={() => setScopeOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-medium hover:bg-[hsl(var(--muted))]/50"
              >
                {scopeOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <FileCode className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                Edit scope
                {editScope.length > 0 ? (
                  <span className="text-xs text-[hsl(var(--primary))]">
                    ({editScope.length} selected)
                  </span>
                ) : (
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">(all pages)</span>
                )}
              </button>
              {scopeOpen && (
                <div className="px-4 pb-4 pt-0 space-y-2 max-h-40 overflow-y-auto">
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Select which pages the AI may edit. Leave all unchecked to allow all pages.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {htmlFiles.map((path) => {
                      const checked = editScope.includes(path);
                      return (
                        <label
                          key={path}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer border transition-colors',
                            checked
                              ? 'bg-[hsl(var(--primary))]/15 border-[hsl(var(--primary))]/50 text-[hsl(var(--foreground))]'
                              : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/30'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditScope((s) => [...s, path]);
                              } else {
                                setEditScope((s) => s.filter((p) => p !== path));
                              }
                            }}
                            className="rounded border-[hsl(var(--input))]"
                          />
                          {path}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <OptimizationChat
            siteId={siteId}
            onDeploy={handleDeploySuccess}
            className="flex-1 min-h-0"
            editScope={editScope.length > 0 ? editScope : undefined}
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
