import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import emptyPlansIllustration from '@/assets/empty-plans.png';
import { Sidebar } from '@/components/layout/Sidebar';
import { Footer } from '@/components/layout/Footer';
import { TourProvider } from '@/features/tour/TourProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAppStore } from '@/store';
import { useFeature } from '@/hooks/useEntitlements';
import { Button } from '@/components/ui/Button';
import { PlusIcon } from '@/components/icons';
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
import { SignInPage } from '@/features/auth/SignInPage';
import { AccountPage } from '@/features/auth/AccountPage';
import { useSession } from '@/lib/authClient';
import type { Country } from '@/domain/country';
import i18n, { languageFromPathname, type Lang } from '@/i18n';

const RootRedirect = () => {
  const { t } = useTranslation();
  const firstId = useAppStore((s) => s.plans[0]?.id);
  const createPlan = useAppStore((s) => s.createPlan);
  const canAccountsTax = useFeature('accountsTax');
  const { data: sessionData } = useSession();
  const taxResidence = sessionData?.user?.taxResidence as Country | undefined;

  if (firstId) return <Navigate to={`/plan/${firstId}/dashboard`} replace />;

  return (
    <section className="empty-plans" aria-labelledby="empty-plans-title">
      <div className="empty-plans__card">
        <div className="empty-plans__banner">
          <img src={emptyPlansIllustration} alt="" />
        </div>
        <div className="empty-plans__content">
          <h1 id="empty-plans-title">{t('plans.emptyTitle')}</h1>
          <p>{t('plans.emptyDescription')}</p>
          <Button
            variant="accent"
            onClick={() => createPlan(t('plans.defaultName'), !canAccountsTax, taxResidence)}
          >
            <PlusIcon /> {t('sidebar.newPlan')}
          </Button>
        </div>
      </div>
    </section>
  );
};

const ProtectedApp = () => {
  const { data: sessionData, isPending } = useSession();

  // Do not render a persisted plan while the session is being checked. This
  // prevents a brief data flash after sign-out or a direct plan URL visit.
  if (isPending) return <main className="auth-screen auth-screen--loading" />;
  if (!sessionData?.user) return <Navigate to="/signin" replace />;

  return (
    <TourProvider>
      <PlanSyncManager />
      <PaywallDialog />
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <div className="app-content">
            <ErrorBoundary feature="app">
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/account" element={<AccountPage />} />
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
          </div>
          <Footer />
        </main>
      </div>
    </TourProvider>
  );
};

const LegacyLocaleRedirect = ({ language }: { language: Lang }) => {
  useEffect(() => {
    const legacyPath =
      window.location.pathname === '/sign-in' ? '/signin' : window.location.pathname;
    window.location.replace(
      `/${language}${legacyPath}${window.location.search}${window.location.hash}`,
    );
  }, [language]);

  return null;
};

const LocalizedApp = ({ language }: { language: Lang }) => (
  <BrowserRouter basename={`/${language}`}>
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/sign-in" element={<Navigate to="/signin" replace />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<ProtectedApp />} />
    </Routes>
  </BrowserRouter>
);

export const App = () => {
  const language = languageFromPathname(window.location.pathname);
  if (!language) {
    const fallbackLanguage: Lang = i18n.resolvedLanguage === 'fr' ? 'fr' : 'en';
    return <LegacyLocaleRedirect language={fallbackLanguage} />;
  }
  return <LocalizedApp language={language} />;
};
