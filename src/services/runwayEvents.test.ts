import { describe, expect, it } from 'vitest';
import { buildRunwayEvents, type RunwayEvent } from '@/services/runwayEvents';
import type { Plan } from '@/domain/plan';
import type { ExpenseIncome } from '@/domain/expenseIncome';
import type { AssetYearValue, Projection, ProjectionYear } from '@/domain/projection';
import type { MonteCarloPercentile, MonteCarloResult } from '@/services/monteCarlo';

// --- fixture builders (only the fields buildRunwayEvents reads are meaningful) ---

const asset = (holdingId: string, value: number): AssetYearValue =>
  ({
    holdingId,
    symbol: holdingId,
    opening: 0,
    appreciation: 0,
    afterAppreciation: 0,
    contributionValue: 0,
    value,
  }) as AssetYearValue;

const mkYear = (
  year: number,
  closing: number,
  perAsset: AssetYearValue[],
  isRetired: boolean,
  opening = 0,
): ProjectionYear =>
  ({
    year,
    openingBalance: opening,
    appreciation: 0,
    balanceAfterAppreciation: 0,
    contribution: 0,
    contributionValue: 0,
    lifestyleSpending: 0,
    flowExpense: 0,
    flowIncome: 0,
    grossWithdrawal: 0,
    taxPaid: 0,
    closingBalance: closing,
    perAsset,
    isRetired,
  }) as ProjectionYear;

const mkProjection = (years: ProjectionYear[], depletionYear: number | null): Projection =>
  ({ scenario: 'expected', years, depletionYear, yearsOfSurvival: null }) as unknown as Projection;

const mkPlan = (
  over: Omit<Partial<Plan>, 'settings'> & { settings?: Partial<Plan['settings']> },
): Plan =>
  ({
    id: 'p1',
    name: 'Test',
    description: '',
    currency: 'CAD',
    holdings: over.holdings ?? [],
    accounts: over.accounts ?? [],
    withdrawalOrder: over.withdrawalOrder ?? [],
    home: over.home,
    settings: {
      retirementYear: 2030,
      currentAge: 40,
      lifeExpectancyAge: 95,
      annualSpending: 60000,
      expensePeriod: 'yearly',
      inflationPct: 4,
      expensesIncomes: [],
      ...over.settings,
    },
    scenario: {},
    createdAt: '',
    updatedAt: '',
  }) as unknown as Plan;

const find = (events: RunwayEvent[], kind: RunwayEvent['kind']) =>
  events.filter((e) => e.kind === kind);

describe('buildRunwayEvents — landmarks', () => {
  it('emits today, retirement, benefits and projection-end at the right years', () => {
    const years = [2025, 2030, 2035, 2060].map((y) => mkYear(y, 100_000, [], y >= 2030));
    const plan = mkPlan({
      settings: {
        retirementYear: 2030,
        lifeExpectancyAge: 95,
        expensesIncomes: [
          {
            id: 'cpp',
            name: 'CPP',
            amount: 12000,
            year: 2035,
            kind: 'income',
            frequency: 'recurring',
            taxable: true,
          },
        ],
      },
    });
    const events = buildRunwayEvents(plan, mkProjection(years, null), null);

    expect(find(events, 'today')[0]?.year).toBe(2025);
    expect(find(events, 'retirement')[0]?.year).toBe(2030);
    expect(find(events, 'benefits')[0]?.year).toBe(2035);
    const end = find(events, 'projection-end')[0];
    expect(end?.year).toBe(2060);
    expect(end?.labelParams?.age).toBe(95);
  });
});

describe('buildRunwayEvents — financial events', () => {
  const baseYears = [2025, 2029, 2031, 2032, 2034].map((y) => mkYear(y, 100_000, [], false));

  it('maps a one-off vehicle expense to a car marker at its year', () => {
    const item: ExpenseIncome = {
      id: 'car',
      name: 'New car',
      amount: 20000,
      year: 2029,
      kind: 'expense',
      category: 'vehicle',
    };
    const plan = mkPlan({ settings: { expensesIncomes: [item] } });
    const events = buildRunwayEvents(plan, mkProjection(baseYears, null), null);
    const expense = find(events, 'expense')[0];
    expect(expense?.year).toBe(2029);
    expect(expense?.icon).toBe('car');
    expect(expense?.amount).toBe(20000);
    expect(expense?.category).toBe('vehicle');
  });

  it.each([
    ['insurance', 'shield'],
    ['relocation', 'globe'],
    ['family', 'family'],
    ['renovation', 'tools'],
    ['business', 'briefcase'],
    ['pension', 'umbrella'],
    ['debt', 'credit-card'],
    ['taxLegal', 'tax'],
    ['salary', 'paycheck'],
    ['rentalIncome', 'key'],
  ] as const)('maps the %s category to its runway icon', (category, icon) => {
    const item: ExpenseIncome = {
      id: category,
      name: category,
      amount: 1000,
      year: 2029,
      kind: 'expense',
      category,
    };
    const plan = mkPlan({ settings: { expensesIncomes: [item] } });
    const events = buildRunwayEvents(plan, mkProjection(baseYears, null), null);
    expect(find(events, 'expense')[0]?.icon).toBe(icon);
  });

  it('emits one marker per year for the full duration of a recurring flow', () => {
    const item: ExpenseIncome = {
      id: 'tuition',
      name: 'Tuition',
      amount: 10000,
      year: 2031,
      endYear: 2034,
      kind: 'expense',
      frequency: 'recurring',
      category: 'education',
    };
    const plan = mkPlan({ settings: { expensesIncomes: [item] } });
    const events = buildRunwayEvents(plan, mkProjection(baseYears, null), null);
    const expenses = find(events, 'expense');
    expect(expenses.map((event) => event.year)).toEqual([2031, 2032, 2033, 2034]);
    expect(expenses.map((event) => event.id)).toEqual([
      'flow:tuition:2031',
      'flow:tuition:2032',
      'flow:tuition:2033',
      'flow:tuition:2034',
    ]);
    expect(expenses.every((event) => event.icon === 'graduation')).toBe(true);
    expect(expenses.every((event) => event.category === 'education')).toBe(true);
    expect(expenses.every((event) => event.frequency === 'recurring')).toBe(true);
  });

  it('stops recurring occurrences at the Runway terminal year', () => {
    const item: ExpenseIncome = {
      id: 'pension',
      name: 'Pension',
      amount: 12000,
      year: 2031,
      endYear: 2040,
      kind: 'income',
      frequency: 'recurring',
    };
    const plan = mkPlan({ settings: { expensesIncomes: [item] } });
    const events = buildRunwayEvents(plan, mkProjection(baseYears, 2034), null);
    expect(find(events, 'income').map((event) => event.year)).toEqual([2031, 2032, 2033, 2034]);
  });

  it('emits home-buy and home-sell markers from plan.home', () => {
    const plan = mkPlan({
      home: {
        id: 'h',
        name: 'House',
        currentValue: 500000,
        appreciationPct: 3,
        purchase: { year: 2032, downPayment: 100000 },
        sale: { year: 2034 },
      } as Plan['home'],
    });
    const events = buildRunwayEvents(plan, mkProjection(baseYears, null), null);
    expect(find(events, 'home-buy')[0]?.year).toBe(2032);
    expect(find(events, 'home-buy')[0]?.icon).toBe('home');
    expect(find(events, 'home-buy')[0]?.category).toBe('home');
    expect(find(events, 'home-sell')[0]?.year).toBe(2034);
    expect(find(events, 'home-sell')[0]?.category).toBe('home');
  });
});

describe('buildRunwayEvents — wealth milestones', () => {
  it('emits a milestone at the first upward crossing, scaled to the peak', () => {
    // Peak 150k (< 250k) => watch the 100k threshold. Opening 90k crosses at year 0.
    const years = [
      mkYear(2025, 150_000, [], false, 90_000),
      mkYear(2026, 160_000, [], false, 150_000),
    ];
    const plan = mkPlan({});
    const events = buildRunwayEvents(plan, mkProjection(years, null), null);
    const milestones = find(events, 'wealth-milestone');
    expect(milestones).toHaveLength(1);
    expect(milestones[0]?.year).toBe(2025);
    expect(milestones[0]?.amount).toBe(100_000);
  });

  it('keeps at most one milestone per year, the highest threshold crossed', () => {
    // Opening 100k jumps straight to 1.5M in one year — crosses everything from
    // 200k up to 1.5M, but only the highest (1.5M) should be reported.
    const years = [
      mkYear(2025, 1_500_000, [], false, 100_000),
      mkYear(2026, 1_600_000, [], false, 1_500_000),
    ];
    const plan = mkPlan({});
    const events = buildRunwayEvents(plan, mkProjection(years, null), null);
    const milestones = find(events, 'wealth-milestone');
    expect(milestones).toHaveLength(1); // one per year, higher threshold wins
    expect(milestones[0]?.amount).toBe(1_500_000);
  });

  it('never reports a threshold at or below the starting value', () => {
    // Opening 500k => the 100k-500k thresholds are already cleared before day one.
    const years = [mkYear(2025, 600_000, [], false, 500_000)];
    const plan = mkPlan({});
    const events = buildRunwayEvents(plan, mkProjection(years, null), null);
    const milestones = find(events, 'wealth-milestone');
    expect(milestones).toHaveLength(1);
    expect(milestones[0]?.amount).toBe(600_000);
  });
});

describe('buildRunwayEvents — drawdown tipping points', () => {
  // Two accounts: RRSP drains by 2030, TFSA drains by 2032 (portfolio dry 2032).
  const plan = mkPlan({
    holdings: [
      { id: 'h1', accountId: 'rrsp' },
      { id: 'h2', accountId: 'tfsa' },
    ] as unknown as Plan['holdings'],
    accounts: [
      { id: 'rrsp', name: 'RRSP' },
      { id: 'tfsa', name: 'TFSA' },
    ] as unknown as Plan['accounts'],
    withdrawalOrder: ['rrsp', 'tfsa'],
    settings: { retirementYear: 2028 },
  });
  const years = [
    mkYear(2027, 150_000, [asset('h1', 100_000), asset('h2', 50_000)], false),
    mkYear(2028, 120_000, [asset('h1', 70_000), asset('h2', 50_000)], true),
    mkYear(2030, 50_000, [asset('h1', 0), asset('h2', 50_000)], true),
    mkYear(2032, 0, [asset('h1', 0), asset('h2', 0)], true),
  ];
  const projection = mkProjection(years, 2032);

  it('emits an account-switch when a funded account empties with a successor', () => {
    const events = buildRunwayEvents(plan, projection, null);
    const switches = find(events, 'account-switch');
    expect(switches).toHaveLength(1);
    expect(switches[0]?.year).toBe(2030);
    expect(switches[0]?.labelParams).toMatchObject({ account: 'RRSP', next: 'TFSA' });
  });

  it('emits portfolio-dry at the depletion year and does not double up the terminal account', () => {
    const events = buildRunwayEvents(plan, projection, null);
    const dry = find(events, 'portfolio-dry');
    expect(dry).toHaveLength(1);
    expect(dry[0]?.year).toBe(2032);
    // The TFSA emptying in 2032 must NOT also produce a switch marker.
    expect(find(events, 'account-switch').some((e) => e.year === 2032)).toBe(false);
  });
});

describe('buildRunwayEvents — Monte-Carlo annotation', () => {
  const years = [
    mkYear(2025, 150_000, [], false, 90_000),
    mkYear(2030, 20_000, [], true),
    mkYear(2032, 0, [], true),
  ];
  const projection = mkProjection(years, 2032);
  const pct = (year: number, p10: number, p50: number): MonteCarloPercentile =>
    ({ year, p1: 0, p5: 0, p10, p25: 0, p50, p75: 0, p90: 0 }) as MonteCarloPercentile;
  const mc: MonteCarloResult = {
    successRate: 0.9,
    percentiles: [pct(2030, 100_000, 100_000), pct(2031, 0, 100_000), pct(2033, 0, 0)],
  } as unknown as MonteCarloResult;

  it('tints uncertain markers by success zone and gives portfolio-dry an MC range', () => {
    const events = buildRunwayEvents(mkPlan({}), projection, mc);
    const dry = find(events, 'portfolio-dry')[0];
    expect(dry?.confidence).toBe('strong'); // 0.9 >= 0.85
    expect(dry?.mcRange).toEqual({ lowYear: 2031, highYear: 2033 });
    expect(find(events, 'wealth-milestone')[0]?.confidence).toBe('strong');
  });

  it('omits confidence and mcRange when there is no Monte-Carlo result', () => {
    const events = buildRunwayEvents(mkPlan({}), projection, null);
    const dry = find(events, 'portfolio-dry')[0];
    expect(dry?.confidence).toBeUndefined();
    expect(dry?.mcRange).toBeUndefined();
  });
});

describe('buildRunwayEvents — ordering', () => {
  it('returns events sorted ascending by year', () => {
    const years = [2025, 2030, 2060].map((y) => mkYear(y, 100_000, [], y >= 2030));
    const plan = mkPlan({
      settings: {
        retirementYear: 2030,
        expensesIncomes: [{ id: 'x', name: 'Gift', amount: 5000, year: 2040, kind: 'income' }],
      },
    });
    const events = buildRunwayEvents(plan, mkProjection(years, null), null);
    const yearsOut = events.map((e) => e.year);
    expect(yearsOut).toEqual([...yearsOut].sort((a, b) => a - b));
  });

  it('always starts at today and ends at the terminal projection point', () => {
    const years = [2025, 2030, 2060].map((y) => mkYear(y, 100_000, [], y >= 2030));
    const plan = mkPlan({
      settings: {
        expensesIncomes: [
          { id: 'past', name: 'Past', amount: 1000, year: 2024, kind: 'expense' },
          { id: 'at-end', name: 'At end', amount: 1000, year: 2060, kind: 'expense' },
          { id: 'after', name: 'After', amount: 1000, year: 2070, kind: 'expense' },
        ],
      },
    });
    const events = buildRunwayEvents(plan, mkProjection(years, null), null);

    expect(events[0]?.kind).toBe('today');
    expect(events.at(-1)?.kind).toBe('projection-end');
    expect(events.some((event) => event.id === 'flow:past' || event.id === 'flow:after')).toBe(
      false,
    );
  });
});
