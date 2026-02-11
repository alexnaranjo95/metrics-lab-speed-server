import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SiteWithBuild } from '@/lib/api';
import { cn, formatBytes, formatTimeAgo } from '@/lib/utils';
import {
  Globe, ExternalLink, Play, Settings, List, Loader2,
  CheckCircle, XCircle, Clock, Plus, X, AlertTriangle,
} from 'lucide-react';

export function DashboardPage() {
  const [showRegister, setShowRegister] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.listSites(),
    refetchInterval: 10000,
  });

  const sites = data?.sites || [];
  const hasActiveBuild = sites.some(s =>
    s.lastBuild && !['success', 'failed'].includes(s.lastBuild.status)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Your Sites</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {sites.length} site{sites.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <button
          onClick={() => setShowRegister(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Register Site
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/5 p-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
            <AlertTriangle className="h-4 w-4" />
            {error instanceof Error ? error.message : 'Failed to load sites. Check your API key.'}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-16 text-[hsl(var(--muted-foreground))]">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
          Loading sites...
        </div>
      )}

      {!isLoading && sites.length === 0 && !error && (
        <div className="text-center py-16">
          <Globe className="h-12 w-12 text-[hsl(var(--muted-foreground))] mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-1">No sites registered yet</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">Register your first WordPress site to start optimizing.</p>
          <button
            onClick={() => setShowRegister(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Register Site
          </button>
        </div>
      )}

      <div className="space-y-4">
        {sites.map(site => (
          <SiteCard key={site.id} site={site} />
        ))}
      </div>

      {showRegister && (
        <RegisterSiteDialog
          onClose={() => setShowRegister(false)}
          onCreated={() => {
            setShowRegister(false);
            queryClient.invalidateQueries({ queryKey: ['sites'] });
          }}
        />
      )}
    </div>
  );
}

// ─── Site Card ────────────────────────────────────────────────────

function SiteCard({ site }: { site: SiteWithBuild }) {
  const queryClient = useQueryClient();
  const triggerMutation = useMutation({
    mutationFn: () => api.triggerBuild(site.id, 'full'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });

  const lb = site.lastBuild;
  const isBuilding = lb && !['success', 'failed'].includes(lb.status);
  const domain = new URL(site.siteUrl).hostname;

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      <div className="p-5">
        {/* Top row: domain + status */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-[hsl(var(--primary))] shrink-0" />
            <div>
              <h3 className="font-semibold text-base">{domain}</h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {site.name}
              </p>
            </div>
          </div>
          <StatusBadge status={site.status} />
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[hsl(var(--muted-foreground))] mb-3">
          {site.pageCount != null && (
            <span>Pages: <span className="font-medium text-[hsl(var(--foreground))]">{site.pageCount}</span></span>
          )}
          {site.totalSizeBytes != null && (
            <span>Size: <span className="font-medium text-[hsl(var(--foreground))]">{formatBytes(site.totalSizeBytes)}</span></span>
          )}
          {site.edgeUrl && (
            <a
              href={site.edgeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[hsl(var(--primary))] hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Edge URL
            </a>
          )}
        </div>

        {/* Last build status */}
        {lb ? (
          <div className={cn(
            'rounded-md px-3 py-2 text-sm',
            lb.status === 'success' ? 'bg-[hsl(var(--success))]/5' :
            lb.status === 'failed' ? 'bg-[hsl(var(--destructive))]/5' :
            'bg-[hsl(var(--primary))]/5'
          )}>
            <div className="flex items-center gap-2">
              <BuildStatusIcon status={lb.status} />
              <span className="font-medium capitalize">{lb.status}</span>
              {lb.completedAt && (
                <span className="text-[hsl(var(--muted-foreground))]">
                  {formatTimeAgo(lb.completedAt)}
                </span>
              )}
              {lb.originalSizeBytes && lb.optimizedSizeBytes && lb.status === 'success' && (
                <span className="ml-auto text-[hsl(var(--success))] font-medium">
                  {formatBytes(lb.originalSizeBytes)} &rarr; {formatBytes(lb.optimizedSizeBytes)}
                  {' '}(-{Math.round((1 - lb.optimizedSizeBytes / lb.originalSizeBytes) * 100)}%)
                </span>
              )}
            </div>
            {lb.status === 'failed' && lb.errorMessage && (
              <p className="text-xs text-[hsl(var(--destructive))] mt-1 truncate">{lb.errorMessage}</p>
            )}
          </div>
        ) : (
          <div className="rounded-md bg-[hsl(var(--muted))]/30 px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
            No builds yet
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-5 py-3 bg-[hsl(var(--muted))]/20 border-t border-[hsl(var(--border))]">
        <Link
          to={`/sites/${site.id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-[hsl(var(--accent))] transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>
        <button
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending || !!isBuilding}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            isBuilding
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-[hsl(var(--accent))]'
          )}
        >
          {triggerMutation.isPending || isBuilding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {isBuilding ? 'Building...' : 'Trigger Build'}
        </button>
        <Link
          to={`/sites/${site.id}/builds`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-[hsl(var(--accent))] transition-colors"
        >
          <List className="h-3.5 w-3.5" />
          Builds
        </Link>
        {lb && isBuilding && (
          <Link
            to={`/sites/${site.id}/builds/${lb.id}`}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 transition-colors"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Watch Live
          </Link>
        )}
      </div>
    </div>
  );
}

function BuildStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success': return <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />;
    case 'failed': return <XCircle className="h-4 w-4 text-[hsl(var(--destructive))]" />;
    case 'queued': return <Clock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />;
    default: return <Loader2 className="h-4 w-4 text-[hsl(var(--primary))] animate-spin" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'px-2 py-0.5 rounded-full text-xs font-medium',
      status === 'active' ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]' :
      'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
    )}>
      {status}
    </span>
  );
}

// ─── Register Site Dialog ─────────────────────────────────────────

function RegisterSiteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.createSite(name, siteUrl),
    onSuccess: () => onCreated(),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold">Register a New Site</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[hsl(var(--muted))]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Site Name</label>
            <input
              type="text"
              placeholder="My Client Site"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] placeholder:text-[hsl(var(--muted-foreground))]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Website URL</label>
            <input
              type="url"
              placeholder="https://example.com"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] placeholder:text-[hsl(var(--muted-foreground))]"
            />
          </div>
          {mutation.error && (
            <p className="text-sm text-[hsl(var(--destructive))]">
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to create site'}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-[hsl(var(--border))]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium hover:bg-[hsl(var(--muted))] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || !siteUrl || mutation.isPending}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              name && siteUrl && !mutation.isPending
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
                : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
            )}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Register
          </button>
        </div>
      </div>
    </div>
  );
}
