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

  const scenarioName = t(SCENARIO_NAME_KEY[plan.scenario.active]);

  return (
    <>
      <div className="calc-section">
        <h4 className="calc-section__title">{t('calc.sectionGrowth')}</h4>
        <ul className="calc-list">
          <li>{t('calc.growthReturn')}</li>
          <li>
            {adj === 0
              ? t('calc.growthScenarioNoAdj', { scenario: scenarioName })
              : t('calc.growthScenarioAdj', {
                  scenario: scenarioName,
                  sign: adj > 0 ? '+' : '',
                  adj,
                })}
          </li>
          <li>{t('calc.growthPortfolio', { count: plan.holdings.length, avg: avgCagr })}</li>
        </ul>
      </div>
      <div className="calc-section">
        <h4 className="calc-section__title">{t('calc.sectionSpending')}</h4>
        <ul className="calc-list">
          <li>
            {plan.settings.inflationPct > 0
              ? t('calc.inflationApplied', { pct: plan.settings.inflationPct })
              : t('calc.inflationNotApplied')}
          </li>
          <li>
            {plan.settings.inflationPct > 0
              ? t('calc.spendingIndexed', {
                  amount: plan.settings.annualSpending.toLocaleString(),
                  currency: plan.currency,
                  year: startYear,
                })
              : t('calc.spendingConstant', {
                  amount: plan.settings.annualSpending.toLocaleString(),
                  currency: plan.currency,
                })}
          </li>
          <li>
            {hasTax
              ? t('calc.withdrawalsWithTax', { retYear: plan.settings.retirementYear })
              : t('calc.withdrawalsNoTax', { retYear: plan.settings.retirementYear })}
          </li>
        </ul>
      </div>
      <div className="calc-section">
        <h4 className="calc-section__title">{t('calc.sectionCurrency')}</h4>
        <ul className="calc-list">
          <li>{t('calc.currencies', { currency: plan.currency })}</li>
          <li>
            {projection.depletionYear === null
              ? t('calc.diagnosticNoDeplete')
              : projection.yearsOfSurvival === null
                ? t('calc.diagnosticDeplete', { year: projection.depletionYear })
                : t('calc.diagnosticDepleteYears', {
                    year: projection.depletionYear,
                    years: projection.yearsOfSurvival,
                  })}
          </li>
        </ul>
      </div>
    </>
  );
};
