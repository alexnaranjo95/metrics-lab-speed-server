import { useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Shell() {
  const location = useLocation();
  const params = useParams();
  const breadcrumbs = buildBreadcrumbs(location.pathname, params);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Top nav */}
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Link to="/" className="flex items-center gap-2 font-semibold text-lg shrink-0">
                <img
                  src="/metrics-lab-logo.png"
                  alt="Metrics Lab"
                  className="h-5 w-auto"
                />
                <span className="hidden sm:inline">Metrics Lab</span>
              </Link>
              {breadcrumbs.length > 0 && (
                <nav className="flex items-center gap-1 text-sm min-w-0">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={crumb.path} className="flex items-center gap-1 min-w-0">
                      <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] shrink-0" />
                      {i === breadcrumbs.length - 1 ? (
                        <span className="text-[hsl(var(--foreground))] font-medium truncate">{crumb.label}</span>
                      ) : (
                        <Link to={crumb.path} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] truncate">
                          {crumb.label}
                        </Link>
                      )}
                    </span>
                  ))}
                </nav>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <ApiKeyInput />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function buildBreadcrumbs(pathname: string, params: Record<string, string | undefined>): { label: string; path: string }[] {
  const crumbs: { label: string; path: string }[] = [];
  if (pathname === '/') return crumbs;

  crumbs.push({ label: 'Sites', path: '/' });

  const siteId = params.siteId;
  if (siteId) {
    crumbs.push({ label: siteId.replace('site_', ''), path: `/sites/${siteId}` });
  }

  if (pathname.includes('/builds/')) {
    const buildId = params.buildId;
    crumbs.push({ label: 'Builds', path: `/sites/${siteId}/builds` });
    if (buildId) {
      crumbs.push({ label: buildId.replace('build_', ''), path: pathname });
    }
  } else if (pathname.endsWith('/builds')) {
    crumbs.push({ label: 'Builds', path: pathname });
  } else if (siteId && pathname === `/sites/${siteId}`) {
    crumbs.push({ label: 'Settings', path: pathname });
  }

  return crumbs;
}

function ApiKeyInput() {
  const [key, setKey] = useState(localStorage.getItem('apiKey') || '');
  const queryClient = useQueryClient();
  const hasKey = !!localStorage.getItem('apiKey');

  const handleConnect = () => {
    localStorage.setItem('apiKey', key);
    // Invalidate all cached queries so they re-fetch with the new key
    queryClient.invalidateQueries();
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="password"
        placeholder="Paste API Key..."
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
          localStorage.setItem('apiKey', e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConnect();
        }}
        className="h-8 w-48 px-3 text-xs rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] placeholder:text-[hsl(var(--muted-foreground))]"
      />
      <button
        onClick={handleConnect}
        disabled={!key}
        className={cn(
          'flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md transition-colors',
          key
            ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
            : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
        )}
      >
        <LogIn className="h-3 w-3" />
        Connect
      </button>
      {hasKey && (
        <span className="w-2 h-2 rounded-full bg-[hsl(var(--success))]" title="API key set" />
      )}
    </div>
  );
}
