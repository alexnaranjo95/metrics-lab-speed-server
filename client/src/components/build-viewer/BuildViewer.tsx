import { useEffect, useRef, useState } from 'react';
import { useScreencastWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Monitor, Wifi, WifiOff, RefreshCw, ExternalLink } from 'lucide-react';

interface BuildViewerProps {
  buildId: string;
  enabled?: boolean;
  siteId?: string;
  edgeUrl?: string | null;
  deployKey?: number;
}

export function BuildViewer({ buildId, enabled = true, siteId, edgeUrl, deployKey = 0 }: BuildViewerProps) {
  const { frameUrl, overlays, phase, isComplete, isConnected } = useScreencastWebSocket({ buildId, enabled });
  const [screenshotKey, setScreenshotKey] = useState(Date.now());
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const useScreenshotFallback =
    edgeUrl?.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:';

  useEffect(() => {
    if (!useScreenshotFallback || !siteId) return;
    const interval = setInterval(() => setScreenshotKey(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [useScreenshotFallback, siteId]);

  const showPostBuildPreview = !enabled && edgeUrl && siteId;

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <span className="text-sm font-medium">Live Build Viewer</span>
          {phase && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
              {phase}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {enabled ? (
            isConnected ? (
              <><Wifi className="h-3 w-3 text-[hsl(var(--success))]" /><span className="text-[hsl(var(--success))]">Connected</span></>
            ) : (
              <><WifiOff className="h-3 w-3 text-[hsl(var(--muted-foreground))]" /><span className="text-[hsl(var(--muted-foreground))]">Disconnected</span></>
            )
          ) : (
            edgeUrl && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    useScreenshotFallback
                      ? setScreenshotKey(Date.now())
                      : iframeRef.current?.contentWindow?.location?.reload()
                  }
                  className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200"
                  title="Refresh"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
                <a
                  href={edgeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[hsl(var(--primary))] hover:underline"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )
          )}
        </div>
      </div>

      {/* Screencast or post-build preview */}
      <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
        {enabled && frameUrl ? (
          <>
            <img
              src={frameUrl}
              alt="Build screencast"
              className="w-full h-full object-contain"
            />
            {overlays.length > 0 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 1280 720"
                preserveAspectRatio="xMidYMid meet"
              >
                {overlays.map((o: any) => (
                  <g key={o.id}>
                    <rect
                      x={o.x} y={o.y} width={o.width} height={o.height}
                      fill="rgba(0,200,100,0.12)" stroke="#00c864" strokeWidth="1.5"
                      rx="2"
                    />
                    <text
                      x={o.x + 2} y={o.y - 3}
                      fill="#00c864" fontSize="10" fontFamily="monospace"
                    >
                      {o.tag}
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </>
        ) : showPostBuildPreview ? (
          useScreenshotFallback ? (
            <img
              src={api.getPreviewScreenshotUrl(siteId!, screenshotKey)}
              alt="Site preview"
              className="w-full h-full object-contain"
            />
          ) : (
            <iframe
              key={deployKey}
              ref={iframeRef}
              src={edgeUrl}
              title="Deployed site preview"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
            {isComplete ? (
              <span className="text-sm">Build complete</span>
            ) : enabled ? (
              <span className="text-sm animate-pulse">Waiting for screencast frames...</span>
            ) : (
              <span className="text-sm">Screencast not active</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
