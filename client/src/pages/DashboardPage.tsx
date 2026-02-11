import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, ExternalLink, Clock, HardDrive, ArrowRight, AlertCircle } from 'lucide-react';
import { cn, formatBytes, formatDate } from '@/lib/utils';

// The dashboard reads sites from the API but since there's no "list sites" endpoint,
// we'll use a site ID input for now.
export function DashboardPage() {
  const [siteId, setSiteId] = useState('');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Manage your WordPress sites and optimization builds
        </p>
      </div>

      {/* Quick navigation */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="text-lg font-semibold mb-4">Navigate to Site</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Enter site ID (e.g., site_abc123)"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="flex-1 h-10 px-3 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] placeholder:text-[hsl(var(--muted-foreground))]"
          />
          <Link
            to={`/sites/${siteId}`}
            className={cn(
              'flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium transition-colors',
              siteId
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
                : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] pointer-events-none'
            )}
          >
            Go to Site
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <InfoCard
          icon={Globe}
          title="Sites"
          description="View and manage site optimization settings"
        />
        <InfoCard
          icon={HardDrive}
          title="Builds"
          description="Monitor build progress with live screencast"
        />
        <InfoCard
          icon={Clock}
          title="Scheduling"
          description="Configure automated build schedules"
        />
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <Icon className="h-8 w-8 text-[hsl(var(--primary))] mb-3" />
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
    </div>
  );
}
