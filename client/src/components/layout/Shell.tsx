import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { Zap, ChevronRight } from 'lucide-react';

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
                <Zap className="h-5 w-5 text-[hsl(var(--primary))]" />
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
  return (
    <input
      type="password"
      placeholder="API Key"
      className="h-8 w-48 px-3 text-xs rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] placeholder:text-[hsl(var(--muted-foreground))]"
      defaultValue={localStorage.getItem('apiKey') || ''}
      onChange={(e) => localStorage.setItem('apiKey', e.target.value)}
    />
  );
}
