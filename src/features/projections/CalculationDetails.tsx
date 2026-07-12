import { useTranslation } from 'react-i18next';
import { scenarioAdjustmentPts, type ScenarioKey } from '@/domain/scenario';
import type { Plan } from '@/domain/plan';
import type { Projection } from '@/domain/projection';

interface CalculationDetailsProps {
  plan: Plan;
  projection: Projection;
}

const SCENARIO_NAME_KEY: Record<ScenarioKey, string> = {
  conservative: 'overview.scenarioConservative',
  expected: 'overview.scenarioExpected',
  optimistic: 'overview.scenarioOptimistic',
};

/** The assumptions behind the projection, as plain paragraphs (no wrapper). */
export const CalculationDetailsContent = ({ plan, projection }: CalculationDetailsProps) => {
  const { t } = useTranslation();
  const adj = scenarioAdjustmentPts(plan.scenario, plan.scenario.active);
  const cagrs = plan.holdings.map((h) => h.expectedCagrPct);
  const avgCagr =
    cagrs.length > 0 ? (cagrs.reduce((a, b) => a + b, 0) / cagrs.length).toFixed(1) : '0';
  // Whether tax actually applies anywhere in the projection (an account is taxed).
  const hasTax = projection.years.some((y) => y.taxPaid > 0.5);
  const startYear = new Date().getFullYear();

  return (
    <>
      <p className="section__desc" style={{ marginBottom: 12 }}>
        {t('calc.p1Intro')}{' '}
        <b style={{ color: 'var(--text)' }}>{t(SCENARIO_NAME_KEY[plan.scenario.active])}</b>
        {adj === 0 ? t('calc.p1NoAdj') : t('calc.p1Adj', { sign: adj > 0 ? '+' : '', adj })}
        {t('calc.p1Holds', { count: plan.holdings.length, avg: avgCagr })}
      </p>
      <p className="section__desc" style={{ marginBottom: 12 }}>
        {t('calc.p2Intro', {
          state: plan.settings.inflationPct > 0 ? t('calc.applied') : t('calc.notApplied'),
          pct: plan.settings.inflationPct,
          amount: plan.settings.annualSpending.toLocaleString(),
          currency: plan.currency,
        })}
        {plan.settings.inflationPct > 0
          ? t('calc.p2Inflated', { year: startYear, retYear: plan.settings.retirementYear })
          : t('calc.p2Constant', { retYear: plan.settings.retirementYear })}
        {hasTax ? t('calc.p2WithTax') : t('calc.p2NoTax')}
      </p>
      <p className="section__desc">
        {t('calc.p3Intro', { currency: plan.currency })}
        {projection.depletionYear === null
          ? t('calc.p3NoDeplete')
          : t('calc.p3Deplete', { year: projection.depletionYear }) +
            (projection.yearsOfSurvival === null
              ? t('calc.p3DepleteEnd')
              : t('calc.p3DepleteYears', { years: projection.yearsOfSurvival }))}
      </p>
    </>
  );
};
