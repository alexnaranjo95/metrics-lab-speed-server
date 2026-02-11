import { useRef, useEffect } from 'react';
import { useBuildLogs, type BuildLogEntry } from '@/hooks/useSSE';
import { cn } from '@/lib/utils';
import { Terminal } from 'lucide-react';

interface BuildLogsProps {
  buildId: string;
  enabled?: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-500',
};

const PHASE_COLORS: Record<string, string> = {
  crawl: 'text-purple-400',
  images: 'text-green-400',
  css: 'text-pink-400',
  js: 'text-yellow-400',
  html: 'text-orange-400',
  fonts: 'text-cyan-400',
  deploy: 'text-blue-400',
  measure: 'text-indigo-400',
};

export function BuildLogs({ buildId, enabled = true }: BuildLogsProps) {
  const { logs, phase, isComplete, isConnected } = useBuildLogs({ buildId, enabled });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Build Logs</span>
          {phase && (
            <span className={cn('text-xs font-mono', PHASE_COLORS[phase] || 'text-gray-400')}>
              [{phase}]
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {logs.length} entries
          {isComplete && ' (complete)'}
        </span>
      </div>

      {/* Log area */}
      <div className="h-80 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {logs.length === 0 && !isComplete && (
          <div className="text-gray-600 animate-pulse">Waiting for logs...</div>
        )}
        {logs.map((log, i) => (
          <LogLine key={i} log={log} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function LogLine({ log }: { log: BuildLogEntry }) {
  const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
  const savings = log.meta?.savings;

  return (
    <div className="flex gap-2 py-0.5 hover:bg-gray-900/50">
      <span className="text-gray-600 shrink-0">{time}</span>
      <span className={cn('shrink-0 w-12', LEVEL_COLORS[log.level] || 'text-gray-400')}>
        {log.level.toUpperCase().padEnd(5)}
      </span>
      <span className={cn('shrink-0 w-16', PHASE_COLORS[log.phase] || 'text-gray-400')}>
        [{log.phase}]
      </span>
      <span className="text-gray-300 break-all">
        {log.message}
        {savings && (
          <span className="text-green-500 ml-2">
            ({formatSize(savings.before)} → {formatSize(savings.after)}, -{Math.round((1 - savings.after / savings.before) * 100)}%)
          </span>
        )}
        {log.meta?.duration && (
          <span className="text-gray-500 ml-2">{log.meta.duration}ms</span>
        )}
      </span>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
