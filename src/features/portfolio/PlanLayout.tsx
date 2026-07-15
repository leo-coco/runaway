import { useEffect } from 'react';
import { Outlet, useOutletContext, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InlineError } from '@/components/InlineError';
import { useAppStore } from '@/store';
import { MASTER_CURRENCIES, type CurrencyCode } from '@/domain/money';
import { usePlan } from '@/hooks/usePlans';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { usePortfolioValue } from '@/hooks/usePortfolioValue';
import { useProjection, type ProjectionResult } from '@/hooks/useProjection';
import { useMonteCarlo, type UseMonteCarloResult } from '@/hooks/useMonteCarlo';
import { useFeature } from '@/hooks/useEntitlements';
import { convertOr, type RatesTable } from '@/services/currencyService';
import { PlanModals } from '@/features/settings/PlanModals';
import type { Plan } from '@/domain/plan';

export interface PlanContext {
  plan: Plan;
  rates: RatesTable | undefined;
  totalValue: number;
  projection: ProjectionResult;
  monteCarlo: UseMonteCarloResult;
}

/** Access the active plan + its shared projection / Monte Carlo from a child page. */
export const usePlanContext = () => useOutletContext<PlanContext>();

export const PlanLayout = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const plan = usePlan(id);
  const setPlanCurrency = useAppStore((s) => s.setPlanCurrency);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setPlanSuccess = useAppStore((s) => s.setPlanSuccess);

  const fx = useExchangeRate(plan?.currency ?? 'USD');
  const rates = fx.data;
  const totalValue = usePortfolioValue(plan, rates);
  const projection = useProjection(plan, rates);
  // Monte Carlo is a premium capability: free users don't compute it (so the
  // Dashboard success card + sidebar % show a locked state, not a number). The
  // deterministic projection above is unaffected and identical across tiers.
  const mcEnabled = useFeature('monteCarlo');
  const monteCarlo = useMonteCarlo(
    plan,
    rates,
    mcEnabled && Boolean(plan && plan.holdings.length > 0),
  );

  // Publish the success rate this page actually computed so the sidebar shows the
  // SAME figure as the Monte Carlo lens (rather than a separate estimate).
  const planId = plan?.id;
  const noHoldings = Boolean(plan && plan.holdings.length === 0);
  const liveSuccess =
    monteCarlo.status === 'done' ? (monteCarlo.result?.successRate ?? null) : null;
  useEffect(() => {
    if (!planId) return;
    if (noHoldings) setPlanSuccess(planId, null);
    else if (liveSuccess !== null) setPlanSuccess(planId, liveSuccess);
  }, [planId, noHoldings, liveSuccess, setPlanSuccess]);

  if (!plan) {
    return (
      <div className="container">
        <div className="state-box">{t('plan.notFound')}</div>
      </div>
    );
  }

  const retirementValue =
    projection.active.years.find((y) => y.year === plan.settings.retirementYear)?.openingBalance ??
    0;

  // Convert lifestyle spending (a plan-currency amount) when the currency changes,
  // so its real value is preserved (holdings are already stored in native currency).
  const changeCurrency = (next: CurrencyCode) => {
    if (next === plan.currency) return;
    if (rates) {
      const converted = Math.round(
        convertOr(plan.settings.annualSpending, plan.currency, next, rates),
      );
      if (converted !== plan.settings.annualSpending) {
        updateSettings(plan.id, { ...plan.settings, annualSpending: converted });
      }
    }
    setPlanCurrency(plan.id, next);
  };

  const ctx: PlanContext = { plan, rates, totalValue, projection, monteCarlo };

  return (
    <div className="container plan-main">
      <div className="plan-topbar">
        <div className="plan-title">
          <div className="plan-title__copy">
            <h1>{plan.name}</h1>
            {plan.description.trim() && (
              <p className="plan-title__description">{plan.description}</p>
            )}
          </div>
          <span className="currency-control" data-tour="currency-selector">
            <label htmlFor="master-currency">{t('plan.currency')}</label>
            <select
              id="master-currency"
              className="select"
              value={plan.currency}
              onChange={(e) => changeCurrency(e.target.value as CurrencyCode)}
            >
              {MASTER_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      {fx.isError && <InlineError error={fx.error} />}

      <ErrorBoundary feature="plan page">
        <Outlet context={ctx} />
      </ErrorBoundary>

      <PlanModals plan={plan} retirementValue={retirementValue} rates={rates} />
    </div>
  );
};
