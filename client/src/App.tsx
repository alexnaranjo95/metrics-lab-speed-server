import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Shell } from './components/layout/Shell';
import { DashboardPage } from './pages/DashboardPage';
import { SitePage } from './pages/SitePage';
import { BuildHistoryPage } from './pages/BuildHistoryPage';
import { BuildPage } from './pages/BuildPage';
import { AgentPage } from './pages/AgentPage';
import { PerformancePage } from './pages/PerformancePage';
import { ReportPage } from './pages/ReportPage';
import { LiveEditPage } from './pages/LiveEditPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

const basename = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sites/:siteId" element={<SitePage />} />
            <Route path="/sites/:siteId/ai" element={<AgentPage />} />
            <Route path="/sites/:siteId/live-edit" element={<LiveEditPage />} />
            <Route path="/sites/:siteId/builds" element={<BuildHistoryPage />} />
            <Route path="/sites/:siteId/builds/:buildId" element={<BuildPage />} />
            <Route path="/sites/:siteId/performance" element={<PerformancePage />} />
            <Route path="/sites/:siteId/performance/report" element={<ReportPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
