import { useEffect, useRef, useState, useCallback } from 'react';

interface UseWebSocketOptions {
  buildId: string;
  enabled?: boolean;
}

export function useScreencastWebSocket({ buildId, enabled = true }: UseWebSocketOptions) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<any[]>([]);
  const [phase, setPhase] = useState<string>('');
  const [isComplete, setIsComplete] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !buildId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/build/${buildId}/screen`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary frame — create blob URL for img src
        const blob = new Blob([event.data], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        // Revoke previous URL to prevent memory leak
        if (prevUrlRef.current) {
          URL.revokeObjectURL(prevUrlRef.current);
        }
        prevUrlRef.current = url;
        setFrameUrl(url);
      } else {
        // JSON message
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'overlay') {
            setOverlays(msg.data.elements || []);
          } else if (msg.type === 'phase') {
            setPhase(msg.phase);
          } else if (msg.type === 'complete') {
            setIsComplete(true);
          }
        } catch { /* ignore parse errors */ }
      }
    };

    return () => {
      ws.close();
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
      }
    };
  }, [buildId, enabled]);

  return { frameUrl, overlays, phase, isComplete, isConnected };
}
