import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ArrowLeft, Bot, Loader2, CheckCircle, XCircle, Square, Clock, AlertTriangle } from 'lucide-react';

const PHASES = ['analyzing', 'planning', 'building', 'verifying', 'reviewing', 'complete'];

const PHASE_LABELS: Record<string, string> = {
  analyzing: 'Analyzing',
  planning: 'AI Planning',
  building: 'Building',
  verifying: 'Verifying',
  reviewing: 'AI Review',
  complete: 'Complete',
  failed: 'Failed',
};

function formatElapsed(ms: number): string {
  if (ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (hours > 0) return `${hours}h ${min}m`;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}

function formatPhaseDuration(timing: { start: string; end?: string } | undefined): string {
  if (!timing) return '';
  const start = new Date(timing.start).getTime();
  const end = timing.end ? new Date(timing.end).getTime() : Date.now();
  return formatElapsed(end - start);
}

export function AgentPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string }>>([]);
  const [phase, setPhase] = useState<string>('');
  const [iteration, setIteration] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [domain, setDomain] = useState<string>('');
  const [startedAt, setStartedAt] = useState<string>('');
  const [phaseTimings, setPhaseTimings] = useState<Record<string, { start: string; end?: string }>>({});
  const [lastError, setLastError] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState<string>('0s');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Poll status
  const { data: status } = useQuery({
    queryKey: ['agent-status', siteId],
    queryFn: () => api.getAgentStatus(siteId!),
    enabled: !!siteId && !!localStorage.getItem('apiKey'),
    refetchInterval: isComplete ? false : 2000,
  });

  // Fetch site for domain fallback when agent not running
  const { data: site } = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => api.getSite(siteId!),
    enabled: !!siteId && !!localStorage.getItem('apiKey') && !domain,
  });

  useEffect(() => {
    if (site?.siteUrl && !domain) {
      try {
        const u = site.siteUrl.startsWith('http') ? site.siteUrl : `https://${site.siteUrl}`;
        setDomain(new URL(u).hostname);
      } catch {
        setDomain(site.siteUrl);
      }
    }
  }, [site?.siteUrl, domain]);

  // Sync state from polling
  useEffect(() => {
    if (!status) return;
    if (status.recentLogs && status.recentLogs.length > logs.length) setLogs(status.recentLogs);
    if (status.phase) {
      setPhase(status.phase);
      if (status.phase === 'complete' || status.phase === 'failed') setIsComplete(true);
    }
    if (status.iteration != null) setIteration(status.iteration);
    if (status.domain) setDomain(status.domain);
    if (status.startedAt) setStartedAt(status.startedAt);
    if (status.phaseTimings) setPhaseTimings(status.phaseTimings);
    if (status.lastError !== undefined) setLastError(status.lastError);
  }, [status]);

  // Elapsed timer (updates every second)
  useEffect(() => {
    if (!startedAt || isComplete) return;
    const interval = setInterval(() => {
      setElapsed(formatElapsed(Date.now() - new Date(startedAt).getTime()));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isComplete]);

  // Final elapsed on complete
  useEffect(() => {
    if (isComplete && startedAt) {
      setElapsed(formatElapsed(Date.now() - new Date(startedAt).getTime()));
    }
  }, [isComplete]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const handleStop = async () => {
    if (!siteId) return;
    try { await api.stopAgent(siteId); } catch { /* ignore */ }
  };

  const currentPhaseIdx = PHASES.indexOf(phase);
  const displayDomain = domain
    ? (() => { try { const u = domain.startsWith('http') ? domain : `https://${domain}`; return new URL(u).hostname; } catch { return domain; } })()
    : (siteId ? `Site: ${siteId}` : '');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/sites/${siteId}`} className="p-1.5 rounded-md hover:bg-[hsl(var(--muted))]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-500" />
              <h1 className="text-xl font-bold">AI Optimization Agent</h1>
            </div>
            <div className="flex items-center gap-3 text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
              <span className="font-medium text-[hsl(var(--foreground))]">{displayDomain}</span>
              <span>Iteration {iteration}/{status?.maxIterations ?? 10}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {elapsed}
              </span>
              {phase && !isComplete && (
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-500')}>
                  <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                  {PHASE_LABELS[phase] || phase}
                </span>
              )}
              {phase === 'complete' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
                  <CheckCircle className="h-3 w-3 inline mr-1" />
                  Complete
                </span>
              )}
              {phase === 'failed' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]">
                  <XCircle className="h-3 w-3 inline mr-1" />
                  Failed
                </span>
              )}
            </div>
          </div>
        </div>
        {!isComplete && (
          <button onClick={handleStop} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10 transition-colors">
            <Square className="h-3.5 w-3.5" />
            Stop Agent
          </button>
        )}
      </div>

      {/* Duration estimate card */}
      {!isComplete && (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <span className="font-medium">Estimated Duration: 45 minutes to 2 hours</span>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 ml-6">
            Complex sites may take longer. You can safely close this tab — we&apos;ll email you when complete.
          </p>
        </div>
      )}

      {/* Error warning */}
      {lastError && phase !== 'failed' && !isComplete && (
        <div className="rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--warning))]">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Encountered error -- retrying...</span>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 ml-6 truncate">{lastError}</p>
        </div>
      )}

      {/* Phase progress bar with timing */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
        <div className="flex items-center gap-1">
          {PHASES.map((p, i) => (
            <div key={p} className="flex items-center flex-1">
              <div className={cn(
                'flex-1 h-2 rounded-full transition-colors',
                currentPhaseIdx > i || phase === 'complete' ? 'bg-purple-500' :
                p === phase && !isComplete ? 'bg-purple-500 animate-pulse' :
                'bg-[hsl(var(--muted))]'
              )} />
              {i < PHASES.length - 1 && <div className="w-1" />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {PHASES.map((p, i) => {
            const timing = phaseTimings[p];
            const isCompleted = currentPhaseIdx > i || phase === 'complete';
            const isCurrent = p === phase && !isComplete;
            const duration = timing ? formatPhaseDuration(timing) : '';

            return (
              <div key={p} className="text-center flex-1">
                <div className={cn(
                  'text-[10px] font-medium',
                  isCompleted ? 'text-purple-500' :
                  isCurrent ? 'text-[hsl(var(--foreground))]' :
                  'text-[hsl(var(--muted-foreground))]'
                )}>
                  {isCompleted && <CheckCircle className="h-3 w-3 inline mr-0.5 -mt-0.5" />}
                  {PHASE_LABELS[p]?.split(' ')[0] || p}
                </div>
                {duration && (
                  <div className={cn(
                    'text-[9px]',
                    isCompleted ? 'text-purple-400' : 'text-[hsl(var(--muted-foreground))]'
                  )}>
                    {isCurrent ? `${duration}...` : duration}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Log viewer */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-gray-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-300">Agent Logs</span>
          </div>
          <span className="text-xs text-gray-500">{logs.length} entries</span>
        </div>
        <div className="h-[500px] overflow-y-auto p-3 font-mono text-xs leading-relaxed">
          {logs.length === 0 && !isComplete && (
            <div className="text-gray-600 animate-pulse">Waiting for agent to start...</div>
          )}
          {logs.map((log, i) => {
            const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
            const isSettings = log.message.includes('[settings]');
            const isError = log.message.toLowerCase().includes('fail') || log.message.toLowerCase().includes('error');
            const isSuccess = log.message.includes('PASS') || log.message.includes('COMPLETE') || log.message.includes('pass');
            const isHeader = log.message.startsWith('═') || log.message.startsWith('PHASE') || log.message.startsWith('  ITERATION');

            return (
              <div key={i} className={cn(
                'py-0.5',
                isHeader ? 'text-purple-400 font-bold mt-2' :
                isSettings ? 'text-cyan-400' :
                isError ? 'text-red-400' :
                isSuccess ? 'text-green-400' :
                'text-gray-300'
              )}>
                <span className="text-gray-600 mr-2">{time}</span>
                {log.message}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Failed state with error */}
      {phase === 'failed' && lastError && (
        <div className="rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5 p-4">
          <h3 className="text-sm font-semibold text-[hsl(var(--destructive))] mb-1">Agent Failed</h3>
          <p className="text-sm text-[hsl(var(--destructive))]">{lastError}</p>
        </div>
      )}
    </div>
  );
}
