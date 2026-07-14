import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ProbabilityView } from '@/features/projections/ProbabilityView';
import { useFeature } from '@/hooks/useEntitlements';
import { UpgradeCard } from '@/features/billing/UpgradeCard';
import { usePlanContext } from './PlanLayout';

export const MonteCarloPage = () => {
  const { plan, monteCarlo, rates } = usePlanContext();
  const { t } = useTranslation();

  // Monte Carlo is premium: not computed for free (PlanLayout gates the run), so
  // show an upsell in place of the analysis rather than an empty view.
  if (!useFeature('monteCarlo')) {
    return (
      <UpgradeCard
        reason="monteCarlo"
        title={t('billing.locked.monteCarloTitle')}
        body={t('billing.locked.monteCarloBody')}
      />
    );
  }

  return (
    <ErrorBoundary feature="probability">
      <ProbabilityView plan={plan} monteCarlo={monteCarlo} rates={rates} />
    </ErrorBoundary>
  );
};
