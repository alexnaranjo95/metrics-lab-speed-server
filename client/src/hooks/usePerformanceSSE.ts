import { useState, useEffect, useCallback, useRef } from 'react';

export interface PerfTestStatus {
  testId: string;
  step: string;
  message: string;
}

export function usePerformanceSSE(siteId: string | undefined, enabled: boolean = false) {
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'complete'>('idle');
  const [progress, setProgress] = useState<PerfTestStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!siteId || !enabled) return;

    const token = localStorage.getItem('apiKey') || '';
    const es = new EventSource(`/api/sites/${siteId}/performance/stream?token=${token}`);
    esRef.current = es;

    es.onopen = () => setIsConnected(true);
    es.onerror = () => setIsConnected(false);

    es.addEventListener('started', (e) => {
      setTestStatus('running');
      setProgress({ testId: JSON.parse(e.data).testId, step: 'started', message: 'Test started...' });
    });

    es.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setProgress(data);
    });

    es.addEventListener('complete', (e) => {
      setTestStatus('complete');
      const data = JSON.parse(e.data);
      setProgress({ testId: data.testId, step: 'complete', message: 'Test complete' });
    });

    return () => {
      es.close();
      esRef.current = null;
      setIsConnected(false);
    };
  }, [siteId, enabled]);

  const reset = useCallback(() => {
    setTestStatus('idle');
    setProgress(null);
  }, []);

  return { testStatus, progress, isConnected, reset };
}
