import { useState } from 'react';
import { TrendingUp, Users, MousePointerClick, Search, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BusinessImpact } from '@/lib/api';

interface BusinessImpactPanelProps {
  impact: BusinessImpact;
  className?: string;
}

export function BusinessImpactPanel({ impact, className }: BusinessImpactPanelProps) {
  const [monthlyTraffic, setMonthlyTraffic] = useState(10000);
  const [conversionRate, setConversionRate] = useState(2);
  const [avgOrderValue, setAvgOrderValue] = useState(100);

  // Calculate projected revenue increase
  const currentConversions = monthlyTraffic * (conversionRate / 100);
  const newConversions = monthlyTraffic * ((conversionRate + (conversionRate * impact.conversionRateIncrease / 100)) / 100);
  const additionalConversions = newConversions - currentConversions;
  const projectedRevenueIncrease = additionalConversions * avgOrderValue;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Impact cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ImpactCard
          icon={MousePointerClick}
          label="Conversion Rate"
          value={`+${impact.conversionRateIncrease.toFixed(1)}%`}
          description="Estimated increase"
          positive={impact.conversionRateIncrease > 0}
        />
        <ImpactCard
          icon={Users}
          label="Bounce Rate"
          value={`-${impact.bounceRateReduction.toFixed(1)}%`}
          description="Estimated reduction"
          positive={impact.bounceRateReduction > 0}
        />
        <ImpactCard
          icon={TrendingUp}
          label="Page Views"
          value={`+${impact.pageViewsIncrease.toFixed(1)}%`}
          description="Estimated increase"
          positive={impact.pageViewsIncrease > 0}
        />
        <ImpactCard
          icon={Search}
          label="SEO Impact"
          value={impact.seoRankingImpact === 'positive' ? 'Positive' : impact.seoRankingImpact === 'negative' ? 'Negative' : 'Neutral'}
          description={`Score ${impact.scoreImprovement > 0 ? '+' : ''}${impact.scoreImprovement} pts`}
          positive={impact.seoRankingImpact === 'positive'}
        />
      </div>

      {/* ROI Calculator */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          ROI Calculator
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Monthly Traffic</label>
            <input
              type="number"
              value={monthlyTraffic}
              onChange={(e) => setMonthlyTraffic(Number(e.target.value))}
              className="w-full mt-1 px-3 py-1.5 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            />
          </div>
          <div>
            <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Conversion Rate (%)</label>
            <input
              type="number"
              step="0.1"
              value={conversionRate}
              onChange={(e) => setConversionRate(Number(e.target.value))}
              className="w-full mt-1 px-3 py-1.5 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            />
          </div>
          <div>
            <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Avg Order Value ($)</label>
            <input
              type="number"
              value={avgOrderValue}
              onChange={(e) => setAvgOrderValue(Number(e.target.value))}
              className="w-full mt-1 px-3 py-1.5 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            />
          </div>
        </div>
        <div className="rounded-md bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 p-3">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Projected Monthly Revenue Increase</div>
          <div className="text-xl font-bold text-[hsl(var(--success))]">
            ${projectedRevenueIncrease.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
            +{additionalConversions.toFixed(0)} conversions/month from {(impact.loadTimeReductionMs / 1000).toFixed(1)}s faster load time
          </div>
        </div>
      </div>
    </div>
  );
}

function ImpactCard({ icon: Icon, label, value, description, positive }: {
  icon: any;
  label: string;
  value: string;
  description: string;
  positive: boolean;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
      </div>
      <div className={cn('text-lg font-bold', positive ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--muted-foreground))]')}>
        {value}
      </div>
      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{description}</div>
    </div>
  );
}
