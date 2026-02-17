import { useEffect, useState, useRef } from 'react';
import { API_BASE } from '@/lib/api';

export interface BuildLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  phase: string;
  message: string;
  meta?: {
    pageUrl?: string;
    assetUrl?: string;
    savings?: { before: number; after: number };
    duration?: number;
  };
}

interface UseSSEOptions {
  buildId: string;
  enabled?: boolean;
}

export function useBuildLogs({ buildId, enabled = true }: UseSSEOptions) {
  const [logs, setLogs] = useState<BuildLogEntry[]>([]);
  const [phase, setPhase] = useState<string>('');
  const [isComplete, setIsComplete] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !buildId) return;

    const token = localStorage.getItem('apiKey') || '';
    const url = token
      ? `${API_BASE}/builds/${buildId}/logs?token=${encodeURIComponent(token)}`
      : `${API_BASE}/builds/${buildId}/logs`;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => setIsConnected(true);
    source.onerror = () => setIsConnected(false);

    // Default message event (existing logs)
    source.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data);
        setLogs(prev => [...prev, log]);
      } catch { /* ignore */ }
    };

    // Progress events (new logs)
    source.addEventListener('progress', (event: MessageEvent) => {
      try {
        const log = JSON.parse(event.data);
        setLogs(prev => [...prev, log]);
      } catch { /* ignore */ }
    });

    // Phase changes
    source.addEventListener('phase', (event: MessageEvent) => {
      try {
        const { phase: p } = JSON.parse(event.data);
        setPhase(p);
      } catch { /* ignore */ }
    });

    // Build completion
    source.addEventListener('complete', (event: MessageEvent) => {
      setIsComplete(true);
      source.close();
    });

    return () => {
      source.close();
    };
  }, [buildId, enabled]);

  return { logs, phase, isComplete, isConnected };
}
