import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OverviewCards } from './OverviewCards';
import { PortfolioTrendCard } from './PortfolioTrendCard';
import { DashboardAssetsCard } from './DashboardAssetsCard';
import { RunwayTimeline } from './RunwayTimeline';
import { MonteCarloSummaryCard } from './MonteCarloSummaryCard';
import { usePlanContext } from './PlanLayout';
import { useAppMode } from '@/providers/AppModeContext';
import { QuickStart } from '@/features/onboarding/QuickStart';
import { SavePlanBanner } from '@/features/onboarding/SavePlanBanner';

export const DashboardPage = () => {
  const { plan, rates, totalValue, projection } = usePlanContext();
  const { t } = useTranslation();
  const { sandbox } = useAppMode();

  const hasAssets = plan.holdings.length > 0;

  // Guest onboarding: a blank sandbox plan (e.g. entered via ?start=empty) runs the
  // quick-start instead of an empty dashboard. It stays mounted through its own result
  // step (which writes holdings, flipping `hasAssets`) until the guest chooses to
  // explore the full dashboard — so gate on this flag, not on `hasAssets` directly.
  const [onboarding, setOnboarding] = useState(() => sandbox && !hasAssets);
  if (onboarding) return <QuickStart onExit={() => setOnboarding(false)} />;

  return (
    <>
      {sandbox && hasAssets ? (
        <ErrorBoundary feature="save plan banner">
          <SavePlanBanner />
        </ErrorBoundary>
      ) : null}

      <div className="hero hero--compact">
        <ErrorBoundary feature="monte carlo summary">
          <MonteCarloSummaryCard />
        </ErrorBoundary>
        <ErrorBoundary feature="runway">
          <RunwayTimeline className="runway--hero" />
        </ErrorBoundary>
      </div>

      <div className="settings-head">
        <span className="settings-head__title">{t('dashboard.planSettings')}</span>
      </div>
      <ErrorBoundary feature="plan settings">
        <OverviewCards plan={plan} rates={rates} />
      </ErrorBoundary>

      {hasAssets ? (
        <>
          <div className="settings-head">
            <span className="settings-head__title">{t('portfolio.title')}</span>
          </div>
          <div className="dash-split">
            <ErrorBoundary feature="portfolio trend">
              <PortfolioTrendCard projection={projection} currency={plan.currency} />
            </ErrorBoundary>
            <ErrorBoundary feature="dashboard assets">
              <DashboardAssetsCard plan={plan} rates={rates} totalValue={totalValue} />
            </ErrorBoundary>
          </div>
        </>
      ) : null}
    </>
  );
};
