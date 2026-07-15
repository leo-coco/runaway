/**
 * Derives the ordered list of waypoints shown on the dashboard runway timeline
 * from a plan and its already-computed projection. Pure and deterministic: the
 * *dates* come from the expected-scenario projection (a timeline needs one date
 * per event, which Monte Carlo can't give); Monte Carlo only *annotates* the
 * uncertain markers (wealth milestones, drawdown tipping points) with a
 * confidence tint and, for the portfolio running dry, a plausible year range.
 *
 * Four families of events (see the plan doc):
 *  1. Landmarks   — today, retirement start, benefits (CPP/OAS) start, plan end.
 *  2. Financial   — user cashflows (expenses/incomes) + home purchase/sale.
 *  3. Milestones  — net-worth thresholds crossed upward, scaled to the plan.
 *  4. Tipping pts — an account empties and drawdown moves on, and the portfolio
 *                   finally running dry.
 */
import { RUNWAY_ICONS, type RunwayIconName } from '@/components/icons';
import { classifySuccess, type SuccessZone } from '@/domain/successRate';
import type { ExpenseCategory, ExpenseIncome } from '@/domain/expenseIncome';
import type { Plan } from '@/domain/plan';
import type { Projection, ProjectionYear } from '@/domain/projection';
import type { MonteCarloPercentile, MonteCarloResult } from '@/services/monteCarlo';

export type RunwayEventKind =
  | 'today'
  | 'retirement'
  | 'benefits'
  | 'projection-end'
  | 'expense'
  | 'income'
  | 'home-buy'
  | 'home-sell'
  | 'wealth-milestone'
  | 'account-switch'
  | 'portfolio-dry';

export interface RunwayEvent {
  readonly id: string;
  readonly kind: RunwayEventKind;
  readonly year: number;
  /** i18n key for the marker label. */
  readonly labelKey: string;
  /** Interpolation params for `labelKey` (account names, thresholds, ages…). */
  readonly labelParams?: Record<string, unknown>;
  /** Amount to show (formatted by the caller), when the event has one. */
  readonly amount?: number;
  readonly icon: RunwayIconName;
  /** Monte-Carlo success tint for uncertain markers (families 3-4). */
  readonly confidence?: SuccessZone;
  /** Monte-Carlo plausible-year band for the portfolio running dry. */
  readonly mcRange?: { readonly lowYear: number; readonly highYear: number };
}

/** Icon per expense/income category. */
const CATEGORY_ICON: Record<ExpenseCategory, RunwayIconName> = {
  general: 'wallet',
  vehicle: 'car',
  travel: 'plane',
  education: 'graduation',
  health: 'heart',
  wedding: 'ring',
  gift: 'gift',
  home: 'home',
};

const EPS = 1;

const iconForFlow = (item: ExpenseIncome): RunwayIconName => {
  const cat = item.category ?? 'general';
  if (cat !== 'general') return CATEGORY_ICON[cat];
  return item.kind === 'income' ? 'gift' : 'wallet';
};

/** Net-worth thresholds to watch, from $5K up to $10M. */
const MILESTONE_THRESHOLDS = [
  5_000, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 200_000,
  300_000, 400_000, 500_000, 600_000, 700_000, 800_000, 900_000, 1_000_000, 1_500_000, 2_000_000,
  3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000, 8_000_000, 9_000_000, 10_000_000,
];

/** Thresholds above the portfolio's starting value — no point flagging a
 *  milestone the plan has already cleared before day one. */
const milestoneThresholds = (initialValue: number): number[] =>
  MILESTONE_THRESHOLDS.filter((t) => t > initialValue);

/** First percentile-series year whose value is at or below `threshold`, else null. */
const firstYearAtOrBelow = (
  percentiles: readonly MonteCarloPercentile[],
  pick: (p: MonteCarloPercentile) => number,
  threshold: number,
): number | null => {
  for (const p of percentiles) {
    if (pick(p) <= threshold) return p.year;
  }
  return null;
};

/** Aggregate each projection year's closing balance per accountId (via holdings). */
const accountBalancesByYear = (
  plan: Plan,
  years: readonly ProjectionYear[],
): Map<string, number>[] => {
  const accountOf = new Map<string, string>();
  for (const h of plan.holdings) {
    if (h.accountId) accountOf.set(h.id, h.accountId);
  }
  return years.map((y) => {
    const byAccount = new Map<string, number>();
    for (const a of y.perAsset) {
      const acc = accountOf.get(a.holdingId);
      if (!acc) continue;
      byAccount.set(acc, (byAccount.get(acc) ?? 0) + a.value);
    }
    return byAccount;
  });
};

export const buildRunwayEvents = (
  plan: Plan,
  projection: Projection,
  mc: MonteCarloResult | null,
): RunwayEvent[] => {
  const { settings } = plan;
  const years = projection.years;
  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  const baseYear = firstYear ? firstYear.year : new Date().getFullYear();
  const endYear = lastYear ? lastYear.year : baseYear;
  const zone = mc ? classifySuccess(mc.successRate) : undefined;
  const events: RunwayEvent[] = [];

  // --- Family 1: landmarks ---
  events.push({
    id: 'today',
    kind: 'today',
    year: baseYear,
    labelKey: 'runway.today',
    icon: 'dot',
  });

  if (settings.retirementYear >= baseYear && settings.retirementYear <= endYear) {
    events.push({
      id: 'retirement',
      kind: 'retirement',
      year: settings.retirementYear,
      labelKey: 'runway.retirement',
      icon: 'umbrella',
    });
  }

  // Benefits (CPP/OAS/pension) = the earliest recurring taxable income flow.
  const benefitsYear = (settings.expensesIncomes ?? [])
    .filter((i) => i.kind === 'income' && i.frequency === 'recurring' && (i.taxable ?? true))
    .reduce<number | null>((min, i) => (min === null || i.year < min ? i.year : min), null);
  if (benefitsYear !== null && benefitsYear > baseYear && benefitsYear <= endYear) {
    events.push({
      id: 'benefits',
      kind: 'benefits',
      year: benefitsYear,
      labelKey: 'runway.benefits',
      icon: 'bank',
    });
  }

  events.push({
    id: 'projection-end',
    kind: 'projection-end',
    year: endYear,
    labelKey: 'runway.projectionEnd',
    labelParams: { age: settings.lifeExpectancyAge },
    icon: 'star',
  });

  // --- Family 2: financial events ---
  for (const item of settings.expensesIncomes ?? []) {
    events.push({
      id: `flow:${item.id}`,
      kind: item.kind === 'income' ? 'income' : 'expense',
      year: item.year,
      labelKey: item.name?.trim()
        ? 'runway.flowNamed'
        : item.kind === 'income'
          ? 'runway.flowIncome'
          : 'runway.flowExpense',
      labelParams: { name: item.name?.trim() || undefined },
      amount: item.amount,
      icon: iconForFlow(item),
    });
  }
  if (plan.home?.purchase) {
    events.push({
      id: 'home:buy',
      kind: 'home-buy',
      year: plan.home.purchase.year,
      labelKey: 'runway.homeBuy',
      amount: plan.home.currentValue,
      icon: 'home',
    });
  }
  if (plan.home?.sale) {
    events.push({
      id: 'home:sell',
      kind: 'home-sell',
      year: plan.home.sale.year,
      labelKey: 'runway.homeSell',
      icon: 'home',
    });
  }

  // --- Family 3: wealth milestones (upward crossings) ---
  const initialValue = firstYear ? firstYear.openingBalance : 0;
  const seenYears = new Set<number>();
  // Highest threshold first so a year with several crossings keeps the biggest.
  for (const threshold of [...milestoneThresholds(initialValue)].reverse()) {
    for (const [i, y] of years.entries()) {
      const prev = i === 0 ? y.openingBalance : years[i - 1]!.closingBalance;
      const cur = y.closingBalance;
      if (prev < threshold && cur >= threshold) {
        const year = y.year;
        // Keep at most one milestone per year (the higher threshold wins).
        if (!seenYears.has(year)) {
          seenYears.add(year);
          events.push({
            id: `milestone:${threshold}`,
            kind: 'wealth-milestone',
            year,
            labelKey: 'runway.milestone',
            labelParams: { amount: threshold },
            amount: threshold,
            icon: 'trophy',
            confidence: zone,
          });
        }
        break;
      }
    }
  }

  // --- Family 4: drawdown tipping points ---
  const balances = accountBalancesByYear(plan, years);
  const accountName = (id: string): string => plan.accounts.find((a) => a.id === id)?.name ?? id;
  const order = plan.withdrawalOrder.length ? plan.withdrawalOrder : plan.accounts.map((a) => a.id);

  for (const accId of order) {
    // First retirement year this account, having been funded, empties.
    let emptyYear: number | null = null;
    let wasFunded = false;
    for (const [i, y] of years.entries()) {
      const bal = balances[i]?.get(accId) ?? 0;
      if (!y.isRetired) {
        if (bal > EPS) wasFunded = true;
        continue;
      }
      if (bal > EPS) {
        wasFunded = true;
      } else if (wasFunded) {
        emptyYear = y.year;
        break;
      }
    }
    if (emptyYear === null) continue;
    // Portfolio running dry is reported by its own marker below — don't double up.
    if (projection.depletionYear !== null && emptyYear >= projection.depletionYear) continue;

    const emptyIdx = years.findIndex((y) => y.year === emptyYear);
    const successor = order.find((id) => id !== accId && (balances[emptyIdx]?.get(id) ?? 0) > EPS);
    if (!successor) continue; // nothing left to draw from = effectively the dry point

    events.push({
      id: `switch:${accId}`,
      kind: 'account-switch',
      year: emptyYear,
      labelKey: 'runway.accountSwitch',
      labelParams: { account: accountName(accId), next: accountName(successor) },
      icon: 'swap',
      confidence: zone,
    });
  }

  if (projection.depletionYear !== null) {
    let mcRange: RunwayEvent['mcRange'];
    if (mc) {
      const low = firstYearAtOrBelow(mc.percentiles, (p) => p.p10, EPS);
      const high = firstYearAtOrBelow(mc.percentiles, (p) => p.p50, EPS);
      if (low !== null && high !== null) mcRange = { lowYear: low, highYear: high };
    }
    events.push({
      id: 'portfolio-dry',
      kind: 'portfolio-dry',
      year: projection.depletionYear,
      labelKey: 'runway.portfolioDry',
      icon: 'alert',
      confidence: zone,
      mcRange,
    });
  }

  // Once the portfolio runs dry, it's the terminal waypoint — nothing after it matters.
  const depletionYear = projection.depletionYear;
  const visible =
    depletionYear !== null
      ? events.filter((e) => e.kind === 'portfolio-dry' || e.year <= depletionYear)
      : events;

  // Stable sort by year (Array.prototype.sort is stable in modern engines).
  return visible.sort((a, b) => a.year - b.year);
};

/** Convenience for renderers: the icon component for an event. */
export const runwayIcon = (event: RunwayEvent) => RUNWAY_ICONS[event.icon];
