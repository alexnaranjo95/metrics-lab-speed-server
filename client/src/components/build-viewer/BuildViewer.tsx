import { useScreencastWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import { Monitor, Wifi, WifiOff } from 'lucide-react';

interface BuildViewerProps {
  buildId: string;
  enabled?: boolean;
}

export function BuildViewer({ buildId, enabled = true }: BuildViewerProps) {
  const { frameUrl, overlays, phase, isComplete, isConnected } = useScreencastWebSocket({ buildId, enabled });

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
          {isConnected ? (
            <><Wifi className="h-3 w-3 text-[hsl(var(--success))]" /><span className="text-[hsl(var(--success))]">Connected</span></>
          ) : (
            <><WifiOff className="h-3 w-3 text-[hsl(var(--muted-foreground))]" /><span className="text-[hsl(var(--muted-foreground))]">Disconnected</span></>
          )}
        </div>
      </div>

      {/* Screencast viewport */}
      <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
        {frameUrl ? (
          <>
            <img
              src={frameUrl}
              alt="Build screencast"
              className="w-full h-full object-contain"
            />
            {/* SVG overlay */}
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
