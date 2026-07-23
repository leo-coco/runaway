import { useEffect } from 'react';
import { Navigate, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InlineError } from '@/components/InlineError';
import { Spinner } from '@/components/ui/Spinner';
import { useAppStore } from '@/store';
import { MASTER_CURRENCIES, type CurrencyCode } from '@/domain/money';
import { usePlan } from '@/hooks/usePlans';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { usePortfolioValue } from '@/hooks/usePortfolioValue';
import { useProjection, type ProjectionResult } from '@/hooks/useProjection';
import { useMonteCarlo, type UseMonteCarloResult } from '@/hooks/useMonteCarlo';
import { useFeature } from '@/hooks/useEntitlements';
import { convert, missingRates, type RatesTable } from '@/services/currencyService';
import { PlanModals } from '@/features/settings/PlanModals';
import { PremiumBanner } from '@/features/billing/PremiumBanner';
import { planCurrencies, type Plan } from '@/domain/plan';
import { useAppMode } from '@/providers/AppModeContext';

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
  const { t, i18n } = useTranslation();
  const plansSynced = useAppStore((s) => s.plansSynced);
  const plan = usePlan(id);
  const setPlanCurrency = useAppStore((s) => s.setPlanCurrency);
  const setPlanSuccess = useAppStore((s) => s.setPlanSuccess);
  const { sandbox } = useAppMode();

  const fx = useExchangeRate(plan?.currency ?? 'USD');
  // A table that cannot cover every currency the plan uses is worse than none:
  // it would convert some amounts and pass the rest through at face value,
  // mixing units inside one total. Withhold it from the engines (so no call can
  // fail on it) and refuse to render figures at all — see the guard below.
  const missing = plan && fx.data ? missingRates(planCurrencies(plan), plan.currency, fx.data) : [];
  const rates = missing.length > 0 ? undefined : fx.data;
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

  // Plans are still reconciling with the server, or FX rates for a real plan
  // haven't loaded yet: show a spinner rather than "not found" / stale amounts
  // that would flip to their real state a moment later.
  if (!plansSynced || (plan && fx.isLoading)) {
    return (
      <div className="container">
        <div className="state-box">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!plan) {
    // The URL may reference a plan from a stale local cache, another account,
    // or a plan deleted in a different tab. Return through RootRedirect, which
    // selects the first current plan or shows the empty-plan experience.
    return <Navigate to="/" replace />;
  }

  if (missing.length > 0) {
    return (
      <div className="container">
        <div className="state-box">
          {t('plan.fxIncomplete', { currencies: missing.join(', ') })}
        </div>
      </div>
    );
  }

  const retirementValue =
    projection.active.years.find((y) => y.year === plan.settings.retirementYear)?.openingBalance ??
    0;

  // Changing the currency restates the whole plan in it: holdings already convert
  // from their native currency on read, so every amount stored in the plan's own
  // currency is rescaled by the same factor to keep the plan's real content intact.
  const changeCurrency = (next: CurrencyCode) => {
    if (next === plan.currency || !rates) return;
    // `next` is outside the plan's currencies until this lands, so it sits outside
    // the guard above: an unquotable target aborts the switch rather than leaving
    // the plan half-converted.
    const factor = convert(1, plan.currency, next, rates);
    if (!factor.ok) return;
    setPlanCurrency(plan.id, next, factor.value);
  };

  const ctx: PlanContext = { plan, rates, totalValue, projection, monteCarlo };
  const lastSaved = new Date(plan.updatedAt);
  const lastSavedLabel = Number.isNaN(lastSaved.getTime())
    ? null
    : new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(lastSaved);

  return (
    <>
      <PremiumBanner />
      <div className="container plan-main">
        <div className="plan-topbar">
          <div className="plan-title">
            <div className="plan-title__copy">
              <div className="plan-title__heading">
                <h1>{plan.name}</h1>
                <span className="currency-control" data-tour="currency-selector">
                  <label htmlFor="master-currency">{t('plan.currency')}</label>
                  <select
                    id="master-currency"
                    className="select"
                    value={plan.currency}
                    disabled={!rates}
                    title={rates ? undefined : t('plan.currencyRatesUnavailable')}
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
              {plan.description.trim() && (
                <p className="plan-title__description">{plan.description}</p>
              )}
            </div>
          </div>
          {!sandbox && lastSavedLabel && (
            <div
              key={plan.updatedAt}
              className="plan-save-badge"
              role="status"
              aria-label={`${t('plan.lastSaved')} ${lastSavedLabel}`}
            >
              <span className="plan-save-badge__dot" aria-hidden="true" />
              <span className="plan-save-badge__label">{t('plan.lastSaved')}</span>
              <time dateTime={plan.updatedAt}>{lastSavedLabel}</time>
            </div>
          )}
        </div>

        {fx.isError && <InlineError error={fx.error} />}

        <ErrorBoundary feature="plan page">
          <Outlet context={ctx} />
        </ErrorBoundary>

        <PlanModals plan={plan} retirementValue={retirementValue} rates={rates} />
      </div>
    </>
  );
};
