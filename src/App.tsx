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
import { CheckoutSuccessDialog } from '@/features/billing/CheckoutSuccessDialog';
import { AdminPage } from '@/features/admin/AdminPage';
import { SignInPage } from '@/features/auth/SignInPage';
import { AccountPage } from '@/features/auth/AccountPage';
import { useSession } from '@/lib/authClient';
import i18n, { languageFromPathname, type Lang } from '@/i18n';
import { AppModeProvider, useAppMode } from '@/providers/AppModeContext';
import { asCountry } from '@/domain/country';

const RootRedirect = () => {
  const { t } = useTranslation();
  const firstId = useAppStore((s) => s.plans[0]?.id);
  const createPlan = useAppStore((s) => s.createPlan);
  const canAccountsTax = useFeature('accountsTax');
  const { data: sessionData } = useSession();
  const { sandbox } = useAppMode();
  const taxResidence = sandbox ? undefined : asCountry(sessionData?.user?.taxResidence);

  if (firstId) return <Navigate to={`/plan/${firstId}/dashboard`} replace />;

  return (
    <section className="empty-plans" aria-labelledby="empty-plans-title">
      <div className="empty-plans__card">
        <div className="empty-plans__banner">
          <img
            src={emptyPlansIllustration.src}
            width={emptyPlansIllustration.width}
            height={emptyPlansIllustration.height}
            alt=""
          />
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

const ProductShell = ({
  syncPlans = false,
  sandbox = false,
}: {
  syncPlans?: boolean;
  sandbox?: boolean;
}) => {
  return (
    <AppModeProvider sandbox={sandbox}>
      <TourProvider>
        {syncPlans && <PlanSyncManager />}
        <PaywallDialog />
        {!sandbox && <CheckoutSuccessDialog />}
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">
            <div className="app-content">
              <ErrorBoundary feature="app">
                <Routes>
                  <Route path="/" element={<RootRedirect />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  {!sandbox && <Route path="/admin" element={<AdminPage />} />}
                  {!sandbox && <Route path="/account" element={<AccountPage />} />}
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
    </AppModeProvider>
  );
};

const ProtectedApp = () => {
  const { data: sessionData, isPending } = useSession();

  // Do not render a persisted plan while the session is being checked. This
  // prevents a brief data flash after sign-out or a direct plan URL visit.
  if (isPending) return <main className="auth-screen auth-screen--loading" />;
  if (!sessionData?.user) return <Navigate to="/signin" replace />;

  return <ProductShell syncPlans />;
};

const AuthenticatedApp = ({ lang }: { lang: Lang }) => (
  <BrowserRouter basename={`/${lang}/app`}>
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/signup" element={<SignInPage />} />
      <Route path="/sign-in" element={<Navigate to="/signin" replace />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<ProtectedApp />} />
    </Routes>
  </BrowserRouter>
);

const legacyAppDestination = (): string => {
  const url = new URL(window.location.href);
  const lang = languageFromPathname(url.pathname) ?? (i18n.resolvedLanguage === 'en' ? 'en' : 'fr');
  let suffix = url.pathname.replace(/^\/app/, '');

  if (suffix === '/signin' && url.searchParams.get('mode') === 'signup') suffix = '/signup';
  if (!suffix) suffix = '/';

  url.searchParams.delete('lang');
  url.searchParams.delete('mode');
  return `/${lang}/app${suffix}${url.search}${url.hash}`;
};

export const App = () => {
  const lang = languageFromPathname(window.location.pathname);

  if (!lang || !new RegExp(`^/${lang}/app(?:/|$)`).test(window.location.pathname)) {
    window.location.replace(legacyAppDestination());
    return null;
  }

  const isSandbox = new RegExp(`^/${lang}/app/sandbox(?:/|$)`).test(window.location.pathname);

  if (isSandbox) {
    return (
      <BrowserRouter basename={`/${lang}/app/sandbox`}>
        <ProductShell sandbox />
      </BrowserRouter>
    );
  }

  return <AuthenticatedApp lang={lang} />;
};
