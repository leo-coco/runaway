import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OverviewCards } from './OverviewCards';
import { PortfolioTrendCard } from './PortfolioTrendCard';
import { DashboardAssetsCard } from './DashboardAssetsCard';
import { RunwayTimeline } from './RunwayTimeline';
import { MonteCarloSummaryCard } from './MonteCarloSummaryCard';
import { usePlanContext } from './PlanLayout';

export const DashboardPage = () => {
  const { plan, rates, totalValue, projection } = usePlanContext();
  const { t } = useTranslation();

  const hasAssets = plan.holdings.length > 0;

  return (
    <>
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
