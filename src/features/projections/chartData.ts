import type { Projection } from '@/domain/projection';
import { SCENARIO_LABEL, type ScenarioKey } from '@/domain/scenario';
import { homeEquitySeries, type Home } from '@/domain/home';
import { rentalPropertiesEquitySeries, type RentalProperty } from '@/domain/rentalProperty';

/** Row shape for the stacked composition chart: one entry per year, keyed by symbol. */
export type CompositionRow = { year: number } & Record<string, number>;

export const buildCompositionData = (projection: Projection): CompositionRow[] =>
  projection.years.map((y) => {
    const row: CompositionRow = { year: y.year };
    for (const a of y.perAsset) row[a.symbol] = a.value;
    return row;
  });

export const buildGrowthData = (projection: Projection): { year: number; total: number }[] =>
  projection.years.map((y) => ({ year: y.year, total: y.closingBalance }));

export const buildOpeningClosingData = (
  projection: Projection,
): { year: number; opening: number; closing: number }[] =>
  projection.years.map((y) => ({
    year: y.year,
    opening: y.openingBalance,
    closing: y.closingBalance,
  }));

export const buildNetChangeData = (projection: Projection): { year: number; net: number }[] =>
  projection.years.map((y) => ({ year: y.year, net: y.closingBalance - y.openingBalance }));

export const buildAppreciationExpensesData = (
  projection: Projection,
): { year: number; appreciation: number; expenses: number }[] =>
  projection.years.map((y) => ({
    year: y.year,
    appreciation: y.appreciation,
    expenses: y.grossWithdrawal,
  }));

export interface ScenarioSeriesRow {
  year: number;
  conservative: number;
  expected: number;
  optimistic: number;
}

export const buildScenarioData = (
  byScenario: Record<ScenarioKey, Projection>,
): ScenarioSeriesRow[] => {
  const len = byScenario.expected.years.length;
  const rows: ScenarioSeriesRow[] = [];
  for (let i = 0; i < len; i += 1) {
    rows.push({
      year: byScenario.expected.years[i]?.year ?? 0,
      conservative: byScenario.conservative.years[i]?.closingBalance ?? 0,
      expected: byScenario.expected.years[i]?.closingBalance ?? 0,
      optimistic: byScenario.optimistic.years[i]?.closingBalance ?? 0,
    });
  }
  return rows;
};

export interface RealEstateRow {
  year: number;
  portfolio: number;
  homeEquity: number;
  rentalEquity: number;
  total: number;
}

/** Portfolio balance, home equity, rental equity and their sum for each projected year. */
export const buildRealEstateData = (
  projection: Projection,
  home: Home | undefined,
  properties: readonly RentalProperty[] | undefined,
  startYear: number,
): RealEstateRow[] => {
  const horizon = projection.years.length - 1;
  const homeByYear = new Map(
    home ? homeEquitySeries(home, startYear, horizon).map((e) => [e.year, e.equity]) : [],
  );
  const rentalByYear = new Map(
    rentalPropertiesEquitySeries(properties, startYear, horizon).map((e) => [e.year, e.equity]),
  );
  return projection.years.map((y) => {
    const homeEquity = homeByYear.get(y.year) ?? 0;
    const rentalEquity = rentalByYear.get(y.year) ?? 0;
    return {
      year: y.year,
      portfolio: y.closingBalance,
      homeEquity,
      rentalEquity,
      total: y.closingBalance + homeEquity + rentalEquity,
    };
  });
};

export const buildSurvivalData = (
  byScenario: Record<ScenarioKey, Projection>,
): { name: string; years: number }[] =>
  (Object.keys(byScenario) as ScenarioKey[]).map((k) => ({
    name: SCENARIO_LABEL[k],
    years: byScenario[k].yearsOfSurvival ?? byScenario[k].years.length,
  }));
