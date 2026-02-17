import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLiveEditStream, type LiveEditLogLine } from '@/hooks/useLiveEditStream';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Terminal,
  RefreshCw,
  ExternalLink,
  Send,
  Loader2,
  Gauge,
  Bug,
  FileDiff,
  Wifi,
  WifiOff,
  ChevronDown,
} from 'lucide-react';

function formatLine(line: LiveEditLogLine): string {
  const prefix = '> ';
  if (line.type === 'thinking' && line.message) return `${prefix}${line.message}`;
  if (line.type === 'patch' && line.path) return `${prefix}Patching ${line.path}...`;
  if (line.type === 'deploy' && line.message) return `${prefix}${line.message}`;
  if (line.type === 'error' && line.message) return `${prefix}[ERROR] ${line.message}`;
  if (line.type === 'done') return `${prefix}Done.`;
  return '';
}

export function LiveEditPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolled, setUserScrolled] = useState(false);

  const hasKey = !!localStorage.getItem('apiKey');

  const { data: status } = useQuery({
    queryKey: ['live-edit-status', siteId],
    queryFn: () => api.getLiveEditStatus(siteId!),
    enabled: !!siteId && hasKey,
  });

  const { lines, isConnected, clear } = useLiveEditStream({
    siteId,
    enabled: !!siteId && hasKey,
  });

  const chatMutation = useMutation({
    mutationFn: (msg: string) => api.liveEditChat(siteId!, msg),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['live-edit-status', siteId] });
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      if (data.deployed) {
        iframeRef.current?.contentWindow?.location?.reload();
      }
    },
    onError: (err: Error) => alert(err.message),
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['live-edit-status', siteId] });
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      iframeRef.current?.contentWindow?.location?.reload();
    },
    onError: (err: Error) => alert(err.message),
  });

  useEffect(() => {
    if (autoScroll && !userScrolled) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines.length, autoScroll, userScrolled]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setUserScrolled(!atBottom);
    if (atBottom) setAutoScroll(true);
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    setUserScrolled(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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

  const edgeUrl = status.edgeUrl;
  const isPending = chatMutation.isPending || auditMutation.isPending || deployMutation.isPending;

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

      {/* Top row: Terminal + Browser (50/50) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Terminal Panel */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-gray-950 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900 shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Terminal</span>
            </div>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <Wifi className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <WifiOff className="h-3 w-3" /> Disconnected
                </span>
              )}
              <button
                type="button"
                onClick={clear}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                Clear
              </button>
            </div>
          </div>
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed text-gray-300"
          >
            {lines.length === 0 && (
              <div className="text-gray-600">Connect before sending messages. Output will appear here.</div>
            )}
            {lines.map((line, i) => {
              const text = formatLine(line);
              if (!text) return null;
              const isError = line.type === 'error';
              return (
                <div
                  key={i}
                  className={cn(
                    'py-0.5',
                    isError && 'text-red-400',
                    line.type === 'deploy' && 'text-green-400'
                  )}
                >
                  {text}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          {userScrolled && lines.length > 0 && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="flex items-center gap-1 w-full px-4 py-1.5 text-xs text-[hsl(var(--primary))] hover:bg-gray-900/50 border-t border-gray-800"
            >
              <ChevronDown className="h-3 w-3" />
              Scroll to bottom
            </button>
          )}
        </div>

        {/* Browser Preview */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--border))] shrink-0">
            <span className="text-sm font-medium">Browser Preview</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => iframeRef.current?.contentWindow?.location?.reload()}
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
              <iframe
                ref={iframeRef}
                src={edgeUrl}
                title="Live site preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-[hsl(var(--muted-foreground))]">
                No edge URL
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Panel */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shrink-0">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => auditMutation.mutate('speed')}
              disabled={isPending}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                auditMutation.isPending
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                  : 'bg-amber-600/20 text-amber-700 dark:text-amber-400 hover:bg-amber-600/30'
              )}
            >
              {auditMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
              Run Speed Audit
            </button>
            <button
              type="button"
              onClick={() => auditMutation.mutate('bugs')}
              disabled={isPending}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                auditMutation.isPending
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                  : 'bg-rose-600/20 text-rose-700 dark:text-rose-400 hover:bg-rose-600/30'
              )}
            >
              {auditMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />}
              Scan for Bugs
            </button>
            <button
              type="button"
              onClick={() => auditMutation.mutate('visual')}
              disabled={isPending}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                auditMutation.isPending
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                  : 'bg-violet-600/20 text-violet-700 dark:text-violet-400 hover:bg-violet-600/30'
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
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                deployMutation.isPending
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                  : 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/30'
              )}
            >
              {deployMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Deploy
            </button>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (message.trim()) {
                  chatMutation.mutate(message.trim());
                  setMessage('');
                }
              }
            }}
            placeholder="Describe changes, bugs to fix, or design updates..."
            className="flex-1 min-h-[80px] px-3 py-2 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm resize-y"
            rows={2}
            disabled={isPending}
          />
          <button
            type="button"
            onClick={() => {
              if (message.trim()) {
                chatMutation.mutate(message.trim());
                setMessage('');
              }
            }}
            disabled={isPending || !message.trim()}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium shrink-0 flex items-center gap-2',
              isPending || !message.trim()
                ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
                : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
            )}
          >
            {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
          AI will apply edits to the workspace and deploy to Cloudflare Pages. Connect to the stream (open this page) before sending.
        </p>
      </div>
    </div>
  );
}
