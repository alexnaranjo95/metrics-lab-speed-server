import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ArrowLeft, Bot, Loader2, CheckCircle, XCircle, Square } from 'lucide-react';

const PHASES = ['analyzing', 'planning', 'building', 'verifying', 'reviewing', 'complete'];

const PHASE_LABELS: Record<string, string> = {
  analyzing: 'Analyzing Live Site',
  planning: 'AI Generating Plan',
  building: 'Building & Deploying',
  verifying: 'Visual + Functional Verification',
  reviewing: 'AI Reviewing & Adjusting',
  complete: 'Complete',
  failed: 'Failed',
};

export function AgentPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string }>>([]);
  const [phase, setPhase] = useState<string>('');
  const [iteration, setIteration] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Poll status as fallback
  const { data: status } = useQuery({
    queryKey: ['agent-status', siteId],
    queryFn: () => api.getAgentStatus(siteId!),
    enabled: !!siteId && !!localStorage.getItem('apiKey'),
    refetchInterval: isComplete ? false : 3000,
  });

  // SSE connection for real-time logs
  useEffect(() => {
    if (!siteId) return;
    const apiKey = localStorage.getItem('apiKey');
    if (!apiKey) return;

    // Use polling fallback since SSE needs auth header
    const interval = setInterval(async () => {
      try {
        const data = await api.getAgentStatus(siteId);
        if (data.recentLogs && data.recentLogs.length > logs.length) {
          setLogs(data.recentLogs);
        }
        if (data.phase) {
          setPhase(data.phase);
          if (data.phase === 'complete' || data.phase === 'failed') setIsComplete(true);
        }
        if (data.iteration) setIteration(data.iteration);
        setIsConnected(data.running || false);
      } catch { /* ignore */ }
    }, 2000);

    return () => clearInterval(interval);
  }, [siteId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const handleStop = async () => {
    if (!siteId) return;
    try { await api.stopAgent(siteId); } catch { /* ignore */ }
  };

  const currentPhaseIdx = PHASES.indexOf(phase);

  return (
    <div className="space-y-6">
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
              {phase && (
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  phase === 'complete' ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]' :
                  phase === 'failed' ? 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]' :
                  'bg-purple-500/10 text-purple-500'
                )}>
                  {isComplete ? (
                    <span className="flex items-center gap-1">
                      {phase === 'complete' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {PHASE_LABELS[phase] || phase}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {PHASE_LABELS[phase] || phase}
                    </span>
                  )}
                </span>
              )}
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {iteration > 0 ? `Iteration ${iteration}/10` : 'Starting...'}
              {' '} -- Claude Opus 4
            </p>
          </div>
        </div>
        {!isComplete && (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10 transition-colors"
          >
            <Square className="h-3.5 w-3.5" />
            Stop Agent
          </button>
        )}
      </div>

      {/* Phase progress bar */}
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
        <div className="flex justify-between mt-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
          {PHASES.map(p => <span key={p}>{PHASE_LABELS[p]?.split(' ')[0] || p}</span>)}
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
    </div>
  );
}
