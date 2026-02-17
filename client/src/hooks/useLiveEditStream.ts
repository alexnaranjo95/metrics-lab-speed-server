import { useEffect, useState, useRef, useCallback } from 'react';
import { API_BASE } from '@/lib/api';

export interface PlanData {
  issues: string[];
  improvements: string[];
  rationale: string;
  edits: Array<{ path: string; newContent: string }>;
  planId: string;
}

export interface VerificationResult {
  ux: { passed: boolean; notes?: string };
  visual: { passed: boolean; notes?: string };
  interactions: { passed: boolean; notes?: string };
  passed: boolean;
}

export type ChatItem =
  | { type: 'thinking'; message: string; timestamp: number }
  | { type: 'message'; role: 'user' | 'assistant'; content: string; streaming?: boolean; timestamp: number }
  | { type: 'plan'; plan: PlanData; timestamp: number }
  | { type: 'step_start'; step: string; description: string; timestamp: number }
  | { type: 'step_complete'; step: string; result: string; timestamp: number }
  | { type: 'patch'; path: string; timestamp: number }
  | { type: 'deploy'; message: string; timestamp: number }
  | { type: 'verification_start'; timestamp: number }
  | { type: 'verification_result'; result: VerificationResult; timestamp: number }
  | { type: 'error'; message: string; timestamp: number }
  | { type: 'done'; timestamp: number };

export interface LiveEditLogLine {
  type: string;
  message?: string;
  path?: string;
  timestamp: number;
}

interface UseLiveEditStreamOptions {
  siteId: string | undefined;
  enabled?: boolean;
}

export function useLiveEditStream({ siteId, enabled = true }: UseLiveEditStreamOptions) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const addItem = useCallback((item: Omit<ChatItem, 'timestamp'>) => {
    setItems((prev) => [...prev, { ...item, timestamp: Date.now() } as ChatItem]);
  }, []);

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

    const parse = (data: string) => {
      try {
        return JSON.parse(data || '{}');
      } catch {
        return {};
      }
    };

    source.addEventListener('thinking', (e: MessageEvent) => {
      const { message } = parse(e.data);
      if (message) addItem({ type: 'thinking', message });
    });
    source.addEventListener('message', (e: MessageEvent) => {
      const { role, content, streaming } = parse(e.data);
      if (role && content) addItem({ type: 'message', role, content, streaming });
    });
    source.addEventListener('plan', (e: MessageEvent) => {
      const data = parse(e.data);
      if (data.planId) addItem({ type: 'plan', plan: data });
    });
    source.addEventListener('step_start', (e: MessageEvent) => {
      const { step, description } = parse(e.data);
      if (step) addItem({ type: 'step_start', step, description });
    });
    source.addEventListener('step_complete', (e: MessageEvent) => {
      const { step, result } = parse(e.data);
      if (step) addItem({ type: 'step_complete', step, result });
    });
    source.addEventListener('patch', (e: MessageEvent) => {
      const { path } = parse(e.data);
      if (path) addItem({ type: 'patch', path });
    });
    source.addEventListener('deploy', (e: MessageEvent) => {
      const { message } = parse(e.data);
      addItem({ type: 'deploy', message: message || 'Deployed' });
    });
    source.addEventListener('verification_start', () => addItem({ type: 'verification_start' }));
    source.addEventListener('verification_result', (e: MessageEvent) => {
      const result = parse(e.data);
      if (result && typeof result.passed === 'boolean') addItem({ type: 'verification_result', result });
    });
    source.addEventListener('error', (e: MessageEvent) => {
      const { message } = parse(e.data);
      if (message) addItem({ type: 'error', message });
    });
    source.addEventListener('done', () => addItem({ type: 'done' }));

    return () => {
      source.close();
    };
  }, [siteId, enabled, addItem]);

  const clear = useCallback(() => setItems([]), []);

  const lines: Array<{ type: string; message?: string; path?: string; timestamp: number }> = items
    .map((item) => {
      if (item.type === 'thinking') return { type: 'thinking', message: item.message, timestamp: item.timestamp };
      if (item.type === 'patch') return { type: 'patch', message: `Patching ${item.path}`, path: item.path, timestamp: item.timestamp };
      if (item.type === 'deploy') return { type: 'deploy', message: item.message, timestamp: item.timestamp };
      if (item.type === 'error') return { type: 'error', message: item.message, timestamp: item.timestamp };
      if (item.type === 'done') return { type: 'done', message: undefined, timestamp: item.timestamp };
      if (item.type === 'step_start') return { type: 'thinking', message: `[${item.step}] ${item.description}`, timestamp: item.timestamp };
      if (item.type === 'step_complete') return { type: 'thinking', message: `[${item.step}] ${item.result}`, timestamp: item.timestamp };
      if (item.type === 'verification_start') return { type: 'thinking', message: 'Verifying UX, visual, interactions...', timestamp: item.timestamp };
      if (item.type === 'verification_result')
        return {
          type: 'thinking',
          message: item.result.passed ? 'Verification passed' : `Verification: UX=${item.result.ux.passed ? 'ok' : 'fail'}, Visual=${item.result.visual.passed ? 'ok' : 'fail'}, Interactions=${item.result.interactions.passed ? 'ok' : 'fail'}`,
          timestamp: item.timestamp,
        };
      if (item.type === 'plan') return { type: 'thinking', message: `Plan ready: ${item.plan.edits.length} file(s) to edit`, timestamp: item.timestamp };
      return { type: 'thinking', message: '', timestamp: item.timestamp };
    })
    .filter((l) => l.type !== 'thinking' || l.message);

  return { items, lines, isConnected, clear };
}
