import { Link, Outlet, useLocation } from 'react-router-dom';
import { Settings, Monitor, LayoutDashboard, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
];

export function Shell() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Top nav */}
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
                <Zap className="h-5 w-5 text-[hsl(var(--primary))]" />
                Metrics Lab
              </Link>
              <nav className="flex items-center gap-1">
                {navItems.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      location.pathname === item.path
                        ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                        : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
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
