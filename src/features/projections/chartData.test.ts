import { describe, expect, it } from 'vitest';
import type { Home } from '@/domain/home';
import type { AssetYearValue, Projection, ProjectionYear } from '@/domain/projection';
import type { RentalProperty } from '@/domain/rentalProperty';
import { SCENARIO_LABEL, type ScenarioKey } from '@/domain/scenario';
import {
  buildAppreciationExpensesData,
  buildCompositionData,
  buildGrowthData,
  buildNetChangeData,
  buildOpeningClosingData,
  buildRealEstateData,
  buildScenarioData,
  buildSurvivalData,
} from './chartData';

const START = 2025;

const asset = (symbol: string, value: number): AssetYearValue => ({
  holdingId: `h-${symbol}`,
  symbol,
  opening: value,
  appreciation: 0,
  afterAppreciation: value,
  contributionValue: 0,
  value,
});

const year = (overrides: Partial<ProjectionYear> & { year: number }): ProjectionYear => ({
  openingBalance: 0,
  appreciation: 0,
  balanceAfterAppreciation: 0,
  contribution: 0,
  contributionValue: 0,
  lifestyleSpending: 0,
  flowExpense: 0,
  flowIncome: 0,
  grossWithdrawal: 0,
  taxPaid: 0,
  flowIncomeTax: 0,
  closingBalance: 0,
  perAsset: [],
  isRetired: false,
  ...overrides,
});

const projection = (
  years: readonly ProjectionYear[],
  overrides: Partial<Projection> = {},
): Projection => ({
  scenario: 'expected',
  years,
  depletionYear: null,
  yearsOfSurvival: null,
  ...overrides,
});

describe('buildCompositionData', () => {
  it("spreads each year's per-asset values into columns keyed by symbol", () => {
    const data = buildCompositionData(
      projection([
        year({ year: START, perAsset: [asset('VOO', 60_000), asset('BTC', 20_000)] }),
        year({ year: START + 1, perAsset: [asset('VOO', 66_000), asset('BTC', 25_000)] }),
      ]),
    );

    expect(data).toEqual([
      { year: START, VOO: 60_000, BTC: 20_000 },
      { year: START + 1, VOO: 66_000, BTC: 25_000 },
    ]);
  });

  it('omits a symbol from years it is absent from rather than zero-filling', () => {
    // Recharts reads a missing key as a gap; the caller relies on that to stop
    // a series at the year its holding was sold.
    const data = buildCompositionData(
      projection([
        year({ year: START, perAsset: [asset('VOO', 10), asset('BTC', 5)] }),
        year({ year: START + 1, perAsset: [asset('VOO', 12)] }),
      ]),
    );

    expect(data[1]).toEqual({ year: START + 1, VOO: 12 });
    expect('BTC' in data[1]!).toBe(false);
  });

  it('emits a year-only row when a year holds nothing', () => {
    expect(buildCompositionData(projection([year({ year: START })]))).toEqual([{ year: START }]);
  });

  it('returns nothing for an empty projection', () => {
    expect(buildCompositionData(projection([]))).toEqual([]);
  });
});

describe('buildGrowthData', () => {
  it('plots the closing balance per year', () => {
    const data = buildGrowthData(
      projection([
        year({ year: START, openingBalance: 100, closingBalance: 110 }),
        year({ year: START + 1, openingBalance: 110, closingBalance: 90 }),
      ]),
    );

    expect(data).toEqual([
      { year: START, total: 110 },
      { year: START + 1, total: 90 },
    ]);
  });
});

describe('buildOpeningClosingData', () => {
  it('carries both balances per year without swapping them', () => {
    const data = buildOpeningClosingData(
      projection([year({ year: START, openingBalance: 500, closingBalance: 540 })]),
    );

    expect(data).toEqual([{ year: START, opening: 500, closing: 540 }]);
  });
});

describe('buildNetChangeData', () => {
  it('is closing minus opening, and goes negative in a drawdown year', () => {
    const data = buildNetChangeData(
      projection([
        year({ year: START, openingBalance: 100, closingBalance: 130 }),
        year({ year: START + 1, openingBalance: 130, closingBalance: 90 }),
      ]),
    );

    expect(data).toEqual([
      { year: START, net: 30 },
      { year: START + 1, net: -40 },
    ]);
  });
});

describe('buildAppreciationExpensesData', () => {
  it('pairs appreciation against the gross withdrawal, not the net spend', () => {
    // The chart compares what the portfolio earned with what it had to give up,
    // so the tax-inclusive gross is the right side of the comparison.
    const data = buildAppreciationExpensesData(
      projection([
        year({
          year: START,
          appreciation: 42_000,
          grossWithdrawal: 55_000,
          lifestyleSpending: 40_000,
        }),
      ]),
    );

    expect(data).toEqual([{ year: START, appreciation: 42_000, expenses: 55_000 }]);
  });
});

describe('buildScenarioData', () => {
  const byScenario = (lengths: Record<ScenarioKey, number[]>): Record<ScenarioKey, Projection> =>
    Object.fromEntries(
      (Object.keys(lengths) as ScenarioKey[]).map((k) => [
        k,
        projection(
          lengths[k].map((balance, i) => year({ year: START + i, closingBalance: balance })),
          { scenario: k },
        ),
      ]),
    ) as Record<ScenarioKey, Projection>;

  it('zips the three scenarios into one row per year', () => {
    const data = buildScenarioData(
      byScenario({ conservative: [90, 80], expected: [100, 105], optimistic: [110, 130] }),
    );

    expect(data).toEqual([
      { year: START, conservative: 90, expected: 100, optimistic: 110 },
      { year: START + 1, conservative: 80, expected: 105, optimistic: 130 },
    ]);
  });

  it('drives the row count off the expected scenario', () => {
    const data = buildScenarioData(
      byScenario({ conservative: [90], expected: [100, 105, 110], optimistic: [110, 130, 150] }),
    );

    expect(data).toHaveLength(3);
  });

  it('zero-fills a scenario that ran out of years early', () => {
    // A conservative run that depletes returns fewer years than expected. The
    // series must keep its year axis rather than truncate to the shortest run.
    const data = buildScenarioData(
      byScenario({ conservative: [90], expected: [100, 105], optimistic: [110, 130] }),
    );

    expect(data[1]).toEqual({ year: START + 1, conservative: 0, expected: 105, optimistic: 130 });
  });

  it('returns nothing when the expected scenario is empty', () => {
    expect(
      buildScenarioData(byScenario({ conservative: [90], expected: [], optimistic: [110] })),
    ).toEqual([]);
  });
});

describe('buildRealEstateData', () => {
  const home: Home = {
    id: 'h1',
    name: 'Maison',
    currentValue: 400_000,
    appreciationPct: 0,
  };

  const rental: RentalProperty = {
    id: 'r1',
    name: 'Studio',
    currentValue: 200_000,
    appreciationPct: 0,
    monthlyRent: 1_000,
    rentInflationPct: 0,
    vacancyPct: 0,
  };

  const twoYears = projection([
    year({ year: START, closingBalance: 50_000 }),
    year({ year: START + 1, closingBalance: 60_000 }),
  ]);

  it('adds portfolio, home equity and rental equity into the total', () => {
    const data = buildRealEstateData(twoYears, home, [rental], START);

    expect(data).toEqual([
      {
        year: START,
        portfolio: 50_000,
        homeEquity: 400_000,
        rentalEquity: 200_000,
        total: 650_000,
      },
      {
        year: START + 1,
        portfolio: 60_000,
        homeEquity: 400_000,
        rentalEquity: 200_000,
        total: 660_000,
      },
    ]);
  });

  it('treats no home and no properties as zero equity, keeping the portfolio row', () => {
    const data = buildRealEstateData(twoYears, undefined, undefined, START);

    expect(data).toEqual([
      { year: START, portfolio: 50_000, homeEquity: 0, rentalEquity: 0, total: 50_000 },
      { year: START + 1, portfolio: 60_000, homeEquity: 0, rentalEquity: 0, total: 60_000 },
    ]);
  });

  it('nets the outstanding mortgage out of home equity', () => {
    const financed: Home = {
      ...home,
      mortgage: { balance: 300_000, ratePct: 0, termYearsRemaining: 30 },
    };

    const [first] = buildRealEstateData(twoYears, financed, undefined, START);

    expect(first!.homeEquity).toBeLessThan(400_000);
    expect(first!.total).toBeCloseTo(50_000 + first!.homeEquity, 6);
  });

  it('sums equity across several rental properties', () => {
    const [first] = buildRealEstateData(
      twoYears,
      undefined,
      [rental, { ...rental, id: 'r2', currentValue: 150_000 }],
      START,
    );

    expect(first!.rentalEquity).toBe(350_000);
  });

  it('falls back to zero equity for a projection year outside the equity series', () => {
    // The equity series is generated from `startYear`, so a projection that
    // begins elsewhere has no matching entry. Joining by index instead of by
    // year would silently shift every property value by the offset.
    const shifted = projection([
      year({ year: START + 10, closingBalance: 50_000 }),
      year({ year: START + 11, closingBalance: 60_000 }),
    ]);

    const data = buildRealEstateData(shifted, home, [rental], START);

    expect(data).toEqual([
      { year: START + 10, portfolio: 50_000, homeEquity: 0, rentalEquity: 0, total: 50_000 },
      { year: START + 11, portfolio: 60_000, homeEquity: 0, rentalEquity: 0, total: 60_000 },
    ]);
  });

  it('returns nothing for an empty projection', () => {
    expect(buildRealEstateData(projection([]), home, [rental], START)).toEqual([]);
  });
});

describe('buildSurvivalData', () => {
  const withSurvival = (years: number, survival: number | null): Projection =>
    projection(
      Array.from({ length: years }, (_, i) => year({ year: START + i })),
      { yearsOfSurvival: survival },
    );

  it('reports years of survival per scenario, labelled', () => {
    const data = buildSurvivalData({
      conservative: withSurvival(30, 12),
      expected: withSurvival(30, 22),
      optimistic: withSurvival(30, 30),
    });

    expect(data).toEqual([
      { name: SCENARIO_LABEL.conservative, years: 12 },
      { name: SCENARIO_LABEL.expected, years: 22 },
      { name: SCENARIO_LABEL.optimistic, years: 30 },
    ]);
  });

  it('falls back to the projected horizon when savings never deplete', () => {
    const data = buildSurvivalData({
      conservative: withSurvival(30, 12),
      expected: withSurvival(30, null),
      optimistic: withSurvival(30, null),
    });

    expect(data[1]!.years).toBe(30);
    expect(data[2]!.years).toBe(30);
  });

  it('does not mistake a zero-survival scenario for a full horizon', () => {
    // `?? ` and `||` differ here: a plan that depletes in its first retired
    // year has 0 years of survival, which `||` would replace with the horizon.
    const data = buildSurvivalData({
      conservative: withSurvival(30, 0),
      expected: withSurvival(30, 22),
      optimistic: withSurvival(30, 30),
    });

    expect(data[0]!.years).toBe(0);
  });
});
