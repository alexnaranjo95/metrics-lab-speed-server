import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

interface MetricCardProps {
  name: string;
  fullName: string;
  before: number;
  after: number;
  improvement: number;
  unit: string;
  thresholds: { good: number; poor: number };
  /** If true, lower is better (default: true for time/size metrics) */
  lowerIsBetter?: boolean;
  className?: string;
}

function formatMetricValue(value: number, unit: string): string {
  if (unit === 's') return `${(value / 1000).toFixed(1)}s`;
  if (unit === 'ms') return `${Math.round(value)}ms`;
  if (unit === '') return value.toFixed(3); // CLS
  return `${value}${unit}`;
}

function getMetricStatus(value: number, thresholds: { good: number; poor: number }): 'good' | 'needs-work' | 'poor' {
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.poor) return 'needs-work';
  return 'poor';
}

const statusColors = {
  good: 'text-[hsl(var(--success))] bg-[hsl(var(--success))]/10',
  'needs-work': 'text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10',
  poor: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10',
};

const statusDotColors = {
  good: 'bg-[hsl(var(--success))]',
  'needs-work': 'bg-[hsl(var(--warning))]',
  poor: 'bg-[hsl(var(--destructive))]',
};

export function MetricCard({
  name,
  fullName,
  before,
  after,
  improvement,
  unit,
  thresholds,
  lowerIsBetter = true,
  className,
}: MetricCardProps) {
  const beforeStatus = getMetricStatus(before, thresholds);
  const afterStatus = getMetricStatus(after, thresholds);
  const improved = lowerIsBetter ? after < before : after > before;
  const unchanged = Math.abs(improvement) < 1;

  return (
    <div className={cn(
      'rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 flex flex-col gap-3',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold">{name}</span>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{fullName}</p>
        </div>
        {/* Improvement badge */}
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
          unchanged ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]' :
          improved ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]' :
          'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]'
        )}>
          {unchanged ? <Minus className="h-3 w-3" /> : improved ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
          {Math.abs(improvement).toFixed(0)}%
        </span>
      </div>

      {/* Before / After values */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-0.5">Before</div>
          <div className="flex items-center gap-1.5">
            <div className={cn('w-1.5 h-1.5 rounded-full', statusDotColors[beforeStatus])} />
            <span className="text-sm font-medium">{formatMetricValue(before, unit)}</span>
          </div>
        </div>
        <span className="text-[hsl(var(--muted-foreground))] text-xs">&rarr;</span>
        <div className="flex-1">
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] mb-0.5">After</div>
          <div className="flex items-center gap-1.5">
            <div className={cn('w-1.5 h-1.5 rounded-full', statusDotColors[afterStatus])} />
            <span className={cn('text-sm font-semibold', improved ? 'text-[hsl(var(--success))]' : '')}>{formatMetricValue(after, unit)}</span>
          </div>
        </div>
      </div>

      {/* Threshold bar */}
      <div className="h-1 rounded-full bg-[hsl(var(--muted))] overflow-hidden flex">
        <div className="bg-[hsl(var(--success))]" style={{ width: `${(thresholds.good / thresholds.poor) * 50}%` }} />
        <div className="bg-[hsl(var(--warning))]" style={{ width: `${50 - (thresholds.good / thresholds.poor) * 50}%` }} />
        <div className="bg-[hsl(var(--destructive))] flex-1" />
      </div>
    </div>
  );
}

// Thresholds from Google's documentation
export const CWV_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  TBT: { good: 200, poor: 600 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  SI: { good: 3400, poor: 5800 },
};
