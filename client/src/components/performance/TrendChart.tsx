import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { TimeSeriesPoint } from '@/lib/api';

interface TrendChartProps {
  data: TimeSeriesPoint[];
  metric?: 'score' | 'lcp' | 'fcp' | 'si' | 'tbt' | 'cls';
  height?: number;
  className?: string;
}

const METRIC_CONFIG: Record<string, {
  originalKey: string;
  optimizedKey: string;
  label: string;
  unit: string;
  formatter: (v: number) => string;
}> = {
  score: {
    originalKey: 'originalScore',
    optimizedKey: 'optimizedScore',
    label: 'Performance Score',
    unit: '',
    formatter: (v) => `${v}`,
  },
  lcp: {
    originalKey: 'originalLcp',
    optimizedKey: 'optimizedLcp',
    label: 'LCP',
    unit: 'ms',
    formatter: (v) => `${(v / 1000).toFixed(1)}s`,
  },
  fcp: {
    originalKey: 'originalFcp',
    optimizedKey: 'optimizedFcp',
    label: 'FCP',
    unit: 'ms',
    formatter: (v) => `${(v / 1000).toFixed(1)}s`,
  },
  si: {
    originalKey: 'originalSi',
    optimizedKey: 'optimizedSi',
    label: 'Speed Index',
    unit: 'ms',
    formatter: (v) => `${(v / 1000).toFixed(1)}s`,
  },
  tbt: {
    originalKey: 'originalTbt',
    optimizedKey: 'optimizedTbt',
    label: 'TBT',
    unit: 'ms',
    formatter: (v) => `${Math.round(v)}ms`,
  },
  cls: {
    originalKey: 'originalCls',
    optimizedKey: 'optimizedCls',
    label: 'CLS',
    unit: '',
    formatter: (v) => v.toFixed(3),
  },
};

export function TrendChart({ data, metric = 'score', height = 300, className }: TrendChartProps) {
  const config = METRIC_CONFIG[metric];

  const chartData = useMemo(() => {
    return data.map(d => ({
      ...d,
      date: new Date(d.testedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center h-[${height}px] text-sm text-[hsl(var(--muted-foreground))]`}>
        No trend data available yet
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            stroke="hsl(var(--border))"
            tickFormatter={config.formatter}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: 12,
            }}
            formatter={(value: number) => [config.formatter(value), '']}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey={config.originalKey}
            name={`Original ${config.label}`}
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={{ r: 3 }}
            strokeDasharray="5 5"
          />
          <Line
            type="monotone"
            dataKey={config.optimizedKey}
            name={`Optimized ${config.label}`}
            stroke="hsl(var(--success))"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
