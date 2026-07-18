import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { monthlyEquivalent } from '@/domain/retirementSettings';
import { DEFAULT_PHASED_SPENDING, realSpendingMultiplier } from '@/domain/spendingModel';
import { SCENARIOS, scenarioAdjustmentPts, type ScenarioKey } from '@/domain/scenario';
import { homeEquitySeries } from '@/domain/home';
import { rentalPropertiesEquitySeries } from '@/domain/rentalProperty';
import type { Plan } from '@/domain/plan';
import { useAppStore } from '@/store';
import { useFeature } from '@/hooks/useEntitlements';
import { ProBadge } from '@/features/billing/ProBadge';
import { totalMonthlyContribution, valueHoldings } from '@/services/portfolioService';
import type { RatesTable } from '@/services/currencyService';

interface OverviewCardsProps {
  plan: Plan;
  rates: RatesTable | undefined;
}

const SCENARIO_PILL_KEY: Record<ScenarioKey, string> = {
  conservative: 'overview.scenarioConservative',
  expected: 'overview.scenarioExpected',
  optimistic: 'overview.scenarioOptimistic',
};

/** The "Plan Settings" grid — the inputs that drive both the projection and the probability. */
export const OverviewCards = ({ plan, rates }: OverviewCardsProps) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const openModal = useAppStore((s) => s.openModal);
  const openPaywall = useAppStore((s) => s.openPaywall);
  const updateScenario = useAppStore((s) => s.updateScenario);
  // Accounts/tax editing and withdrawal ordering are premium: free can view the
  // resulting numbers but not customize the inputs.
  const accountsLocked = !useFeature('accountsTax');
  const withdrawalLocked = !useFeature('withdrawalOrdering');
  // Real estate (Home) is premium: free keeps any existing equity number visible
  // but cannot open the editor.
  const homeLocked = !useFeature('realEstate');

  const monthlyContribution = useMemo(
    () => totalMonthlyContribution(valueHoldings(plan.holdings, plan.currency, rates)),
    [plan.holdings, plan.currency, rates],
  );

  const startYear = new Date().getFullYear();
  const retiringAtAge =
    plan.settings.currentAge > 0
      ? plan.settings.currentAge + (plan.settings.retirementYear - startYear)
      : null;

  // Phased spending: the card shows the Go-Go budget plus the decayed end figure.
  const phasedSpending = plan.settings.spendingMode === 'phased';
  const phaseCfg = plan.settings.phasedSpending ?? DEFAULT_PHASED_SPENDING;
  const endOfLifeSpending = phasedSpending
    ? plan.settings.annualSpending *
      realSpendingMultiplier(plan.settings.lifeExpectancyAge, phaseCfg)
    : null;

  // Expense/income flows (home purchase/sale, inheritance, tuition…) summary for
  // the card. A recurring flow counts as "next" while it's still ongoing, i.e.
  // until its (effective) end year has passed — not just its start year.
  const expensesIncomes = plan.settings.expensesIncomes ?? [];
  const flowCount = expensesIncomes.length;
  const flowEndYear = (e: (typeof expensesIncomes)[number]) =>
    e.frequency === 'recurring' ? (e.endYear ?? e.year) : e.year;
  const nextFlow = expensesIncomes
    .filter((e) => flowEndYear(e) >= startYear)
    .sort((a, b) => a.year - b.year)[0];

  // Combined real-estate equity today (home + rentals) and property count, for
  // the single premium "Immobilier" summary card.
  const homeEquityNow = plan.home ? (homeEquitySeries(plan.home, startYear, 0)[0]?.equity ?? 0) : 0;
  const rentalCount = plan.properties?.length ?? 0;
  const rentalEquityNow =
    rentalCount > 0
      ? (rentalPropertiesEquitySeries(plan.properties, startYear, 0)[0]?.equity ?? 0)
      : 0;
  const realEstateEquityNow = homeEquityNow + rentalEquityNow;
  const realEstateCount = (plan.home ? 1 : 0) + rentalCount;

  return (
    <div className="overview-grid">
      <Card className="ov" data-tour="timeline-card">
        <div className="ov__head">
          <span className="ov__title">{t('overview.retirementTimeline')}</span>
          <span className="ov__link" onClick={() => openModal('retirementYear')}>
            {t('common.edit')}
          </span>
        </div>
        <div className="ov__body">
          <div className="ov__content">
            <span className="ov__big ov__big--lg">{plan.settings.retirementYear}</span>
            <span className="ov__sub">
              {retiringAtAge !== null
                ? t('overview.timelineSub', {
                    age: plan.settings.currentAge,
                    retireAge: retiringAtAge,
                    lifeAge: plan.settings.lifeExpectancyAge,
                  })
                : t('overview.timelineSubShort', { lifeAge: plan.settings.lifeExpectancyAge })}
            </span>
          </div>
        </div>
      </Card>

      <Card className="ov" data-tour="savings-card">
        <div className="ov__head">
          <span className="ov__title">{t('overview.savingsCapacity')}</span>
          <span className="ov__link" onClick={() => openModal('savings')}>
            {t('common.edit')}
          </span>
        </div>
        <div className="ov__body">
          <div className="ov__content">
            <span className="ov__big">
              {fmt.compact(monthlyContribution)}
              {t('common.perMonth')}
            </span>
            <span className="ov__sub">
              {t('overview.savingsSub', {
                yearly: fmt.compact(monthlyContribution * 12),
                year: plan.settings.retirementYear,
              })}
            </span>
          </div>
        </div>
      </Card>

      <Card className="ov" data-tour="spending-card">
        <div className="ov__head">
          <span className="ov__title" title={t('overview.lifestyleSpendingHint')}>
            {t('overview.lifestyleSpending')}
            {phasedSpending && <span className="ov__badge">{t('overview.phasedBadge')}</span>}
          </span>
          <span className="ov__link" onClick={() => openModal('retirementSettings')}>
            {t('common.edit')}
          </span>
        </div>
        <div className="ov__body">
          <div className="ov__content">
            <span className="ov__big">
              {fmt.compact(plan.settings.annualSpending)}
              {t('common.perYear')}
            </span>
            <span className="ov__sub">
              {phasedSpending
                ? t('overview.spendingSubPhased', {
                    end: fmt.compact(endOfLifeSpending ?? 0),
                    inflation: plan.settings.inflationPct,
                  })
                : t('overview.spendingSub', {
                    monthly: fmt.compact(monthlyEquivalent(plan.settings.annualSpending)),
                    inflation: plan.settings.inflationPct,
                    year: plan.settings.retirementYear,
                  })}
            </span>
          </div>
        </div>
      </Card>

      <Card className="ov">
        <div className="ov__head">
          <span className="ov__title">{t('overview.expensesIncomes')}</span>
          <span className="ov__link" onClick={() => openModal('expensesIncomes')}>
            {t('common.edit')}
          </span>
        </div>
        <div className="ov__body">
          <div className="ov__content">
            <span className="ov__big">
              {flowCount === 0 ? '—' : t('overview.expensesIncomesCount', { count: flowCount })}
            </span>
            <span className="ov__sub">
              {nextFlow
                ? t('overview.expensesIncomesNext', {
                    amount: fmt.compact(nextFlow.amount),
                    year: nextFlow.year,
                  })
                : t('overview.expensesIncomesEmpty')}
            </span>
          </div>
        </div>
      </Card>

      <Card className="ov">
        <div className="ov__head">
          <span className="ov__title">{t('overview.realEstate')}</span>
          {homeLocked ? (
            <span className="ov__link" onClick={() => openPaywall('realEstate')}>
              <ProBadge />
            </span>
          ) : (
            <span className="ov__link" onClick={() => openModal('realEstate')}>
              {t('common.edit')}
            </span>
          )}
        </div>
        <div className="ov__body">
          <div className="ov__content">
            <span className="ov__big">
              {realEstateCount > 0 ? fmt.compact(realEstateEquityNow) : '—'}
            </span>
            <span className="ov__sub">
              {realEstateCount > 0
                ? t('overview.realEstateSub', { count: realEstateCount })
                : t('overview.realEstateEmpty')}
            </span>
          </div>
        </div>
      </Card>

      <Card className="ov" data-tour="scenario-pills">
        <div className="ov__head">
          <span className="ov__title">{t('overview.projectionScenario')}</span>
          <span className="ov__link" onClick={() => openModal('scenario')}>
            {t('common.edit')}
          </span>
        </div>
        <select
          className="select"
          aria-label={t('overview.projectionScenario')}
          value={plan.scenario.active}
          onChange={(e) =>
            updateScenario(plan.id, { ...plan.scenario, active: e.target.value as ScenarioKey })
          }
        >
          {SCENARIOS.map((key) => {
            const adjPts = scenarioAdjustmentPts(plan.scenario, key);
            const sign = adjPts > 0 ? '+' : '';
            return (
              <option key={key} value={key}>
                {t(SCENARIO_PILL_KEY[key])} {sign}
                {adjPts}%
              </option>
            );
          })}
        </select>
      </Card>

      <Card className="ov" data-tour="accounts-card">
        <div className="ov__head">
          <span className="ov__title">{t('overview.accountsTax')}</span>
          {accountsLocked ? (
            <span className="ov__link" onClick={() => openPaywall('accountsTax')}>
              <ProBadge />
            </span>
          ) : (
            <span className="ov__link" onClick={() => openModal('accounts')}>
              {t('common.edit')}
            </span>
          )}
        </div>
        <div className="ov__body">
          <div className="ov__content">
            <span className="ov__big">
              {plan.accounts.length}{' '}
              <span className="ov__big-unit">
                {t('overview.accountsUnit', { count: plan.accounts.length })}
              </span>
            </span>
          </div>
        </div>
      </Card>

      <Card className="ov" data-tour="withdrawal-card">
        <div className="ov__head">
          <span className="ov__title">{t('overview.withdrawalStrategy')}</span>
          {withdrawalLocked ? (
            <span className="ov__link" onClick={() => openPaywall('withdrawalOrdering')}>
              <ProBadge />
            </span>
          ) : (
            <span className="ov__link" onClick={() => openModal('withdrawalOrder')}>
              {t('common.edit')}
            </span>
          )}
        </div>
        <div className="ov__body">
          <div className="ov__content">
            <span
              className="ov__big"
              style={{
                color: plan.accounts.length === 0 ? 'var(--amber)' : undefined,
              }}
            >
              {plan.accounts.length === 0
                ? t('overview.withdrawalNotSet')
                : t('overview.withdrawalReady')}
            </span>
            <span className="ov__sub">{t('overview.withdrawalSub')}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
