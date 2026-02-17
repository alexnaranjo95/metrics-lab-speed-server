import { useEffect, useState, useRef } from 'react';
import { API_BASE } from '@/lib/api';

export interface LiveEditLogLine {
  type: 'thinking' | 'patch' | 'deploy' | 'error' | 'done';
  message?: string;
  path?: string;
  timestamp: number;
}

interface UseLiveEditStreamOptions {
  siteId: string | undefined;
  enabled?: boolean;
}

export function useLiveEditStream({ siteId, enabled = true }: UseLiveEditStreamOptions) {
  const [lines, setLines] = useState<LiveEditLogLine[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !siteId) return;

    const token = localStorage.getItem('apiKey') || '';
    const url = token
      ? `${API_BASE}/sites/${siteId}/live-edit/stream?token=${encodeURIComponent(token)}`
      : `${API_BASE}/sites/${siteId}/live-edit/stream`;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => setIsConnected(true);
    source.onerror = () => setIsConnected(false);

    const addLine = (type: LiveEditLogLine['type'], data?: { message?: string; path?: string }) => {
      setLines((prev) => [...prev, { type, ...data, timestamp: Date.now() }]);
    };

    source.addEventListener('thinking', (e: MessageEvent) => {
      try {
        const { message } = JSON.parse(e.data || '{}');
        addLine('thinking', { message });
      } catch { /* ignore */ }
    });
    source.addEventListener('patch', (e: MessageEvent) => {
      try {
        const { path } = JSON.parse(e.data || '{}');
        addLine('patch', { path, message: path ? `Patching ${path}` : undefined });
      } catch { /* ignore */ }
    });
    source.addEventListener('deploy', (e: MessageEvent) => {
      try {
        const { message } = JSON.parse(e.data || '{}');
        addLine('deploy', { message });
      } catch { /* ignore */ }
    });
    source.addEventListener('error', (e: MessageEvent) => {
      try {
        const { message } = JSON.parse(e.data || '{}');
        addLine('error', { message });
      } catch { /* ignore */ }
    });
    source.addEventListener('done', () => addLine('done'));

    return () => {
      source.close();
    };
  }, [siteId, enabled]);

  const clear = () => setLines([]);

  return { lines, isConnected, clear };
}
