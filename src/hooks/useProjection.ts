import { useMemo } from 'react';
import type { Plan } from '@/domain/plan';
import type { Projection } from '@/domain/projection';
import type { ScenarioKey } from '@/domain/scenario';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import { project, projectAllScenarios } from '@/services/retirementCalculator';
import { allocationByClass, valueHoldings } from '@/services/portfolioService';
import { buildProjectionInput } from '@/services/projectionBuilder';
import type { RatesTable } from '@/services/currencyService';

export interface ProjectionResult {
  readonly active: Projection;
  readonly byScenario: Record<ScenarioKey, Projection>;
  readonly allocation: readonly { assetClass: string; value: number }[];
  readonly startYear: number;
}

const emptyProjection = (scenario: ScenarioKey): Projection => ({
  scenario,
  years: [],
  depletionYear: null,
  yearsOfSurvival: null,
});

/**
 * Build the year-by-year projection for the plan. Heavy reduce work is memoised
 * on the inputs that actually affect the result. Tolerates a missing plan.
 */
export const useProjection = (
  plan: Plan | undefined,
  rates: RatesTable | undefined,
): ProjectionResult =>
  useMemo(() => {
    const startYear = new Date().getFullYear();

    if (!plan) {
      return {
        active: emptyProjection('expected'),
        byScenario: {
          conservative: emptyProjection('conservative'),
          expected: emptyProjection('expected'),
          optimistic: emptyProjection('optimistic'),
        },
        allocation: [],
        startYear,
      };
    }

    const values = valueHoldings(plan.holdings, plan.currency, rates);
    // Project through the same horizon the Monte Carlo uses — the year the user
    // reaches their life-expectancy age — so both lenses cover the same period.
    const { currentAge, lifeExpectancyAge } = plan.settings;
    const endYear = lifeExpectancyYear(currentAge, startYear, lifeExpectancyAge);
    const horizonYears = Math.max(1, endYear - startYear);
    const input = buildProjectionInput(plan, rates, startYear, horizonYears);

    return {
      active: project(input, plan.scenario.active),
      byScenario: projectAllScenarios(input),
      allocation: allocationByClass(values).map((a) => ({
        assetClass: a.assetClass,
        value: a.value,
      })),
      startYear,
    };
  }, [plan, rates]);
