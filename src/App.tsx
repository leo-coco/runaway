import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Footer } from '@/components/layout/Footer';
import { TourProvider } from '@/features/tour/TourProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAppStore } from '@/store';
import { PlansPage } from '@/features/plans/PlansPage';
import { PlanLayout } from '@/features/portfolio/PlanLayout';
import { DashboardPage } from '@/features/portfolio/DashboardPage';
import { PortfolioPage } from '@/features/portfolio/PortfolioPage';
import { ProjectionPage } from '@/features/portfolio/ProjectionPage';
import { MonteCarloPage } from '@/features/portfolio/MonteCarloPage';
import { MethodologyPage } from '@/features/methodology/MethodologyPage';
import { PlanSyncManager } from '@/features/auth/PlanSyncManager';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { PaywallDialog } from '@/features/billing/PaywallDialog';
import { AdminPage } from '@/features/admin/AdminPage';

const RootRedirect = () => {
  const firstId = useAppStore((s) => s.plans[0]?.id);
  return <Navigate to={firstId ? `/plan/${firstId}/dashboard` : '/plans'} replace />;
};

export const App = () => (
  <BrowserRouter>
    <TourProvider>
      <PlanSyncManager />
      <PaywallDialog />
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <ErrorBoundary feature="app">
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/plan/:id" element={<PlanLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="portfolio" element={<PortfolioPage />} />
                <Route path="projection" element={<ProjectionPage />} />
                <Route path="monte-carlo" element={<MonteCarloPage />} />
                <Route path="methodology" element={<MethodologyPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
          <Footer />
        </main>
      </div>
    </TourProvider>
  </BrowserRouter>
);
