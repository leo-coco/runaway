import type { ProjectionYear, Projection } from '@/domain/projection';
import { scenarioAdjustmentPts, type ScenarioConfig, type ScenarioKey } from '@/domain/scenario';
import type { Country, Province } from '@/domain/country';
import { capitalGainsTax, incomeTax } from '@/domain/tax';
import { DEFAULT_GROWTH_FADE, fadedCagrPct, type GrowthFadeConfig } from '@/domain/growthFade';
import {
  realSpendingMultiplier,
  type PhasedSpendingConfig,
  type SpendingMode,
} from '@/domain/spendingModel';
import {
  expenseIncomeAmountsForYear,
  saleReinvestModeForYear,
  type ExpenseIncome,
} from '@/domain/expenseIncome';
import { applyForcedFlows, deferredBalance, type ConversionPlan } from '@/domain/taxAdvantaged';
import {
  accountEffectiveRate,
  accountTaxProfile,
  type Account,
  type AccountKind,
} from '@/domain/account';

/** Per-asset input to the projection engine, already in plan currency. */
export interface ProjectionAssetInput {
  readonly holdingId: string;
  readonly symbol: string;
  /** Starting (opening) value in the plan currency. */
  readonly startValue: number;
  /** Base expected CAGR in percent (e.g. 15 = 15%/yr). */
  readonly baseCagrPct: number;
  /** Recurring annual contribution in the plan currency (accumulation phase). */
  readonly annualContribution: number;
  /** Tax envelope this holding belongs to (null/undefined = unassigned). */
  readonly accountId?: string | null;
  /** Cost basis in the plan currency for dynamic capital-gains tracking. */
  readonly costBasis?: number;
  /** False = illiquid: grows and counts in the balance, but is never drawn down. */
  readonly drawable?: boolean;
}

/** Tax envelope input for the decumulation (withdrawal) phase. */
export interface ProjectionAccountInput {
  readonly id: string;
  /** Account kind — drives RMD (tax-deferred) and where RMD surplus is reinvested. */
  readonly kind?: AccountKind;
  /** Flat effective tax rate (used when no progressive profile is provided). */
  readonly effectiveTaxRate: number;
  /** Fraction of gross flowing into ordinary income (progressive). Default 0. */
  readonly incomeCoef?: number;
  /** Fraction of gross flowing into the US LTCG ladder (progressive). Default 0. */
  readonly gainsCoef?: number;
  /** Flat tax on the gross (capital-gains flat / manual). Default = effectiveTaxRate. */
  readonly flatRate?: number;
  /** Foreign withholding rate, credited against residence tax. Default 0. */
  readonly withholding?: number;
}

/** Per-year tax context for the progressive settlement. */
export interface WithdrawalContext {
  readonly residence: Country;
  /** Canadian province for the combined bracket schedule (default ON). */
  readonly province?: Province;
  /** Bracket-threshold inflation factor for the year (keeps real brackets constant). */
  readonly inflationFactor: number;
  /**
   * Units of plan currency per unit of the residence country's local currency.
   * Scales bracket thresholds (and the NIIT threshold) so schedules legislated
   * in EUR/USD/CAD apply correctly to plan-currency amounts. Default 1.
   */
  readonly fxFactor?: number;
  /**
   * Ordinary income already received this year from non-portfolio sources (pension,
   * salary…). Withdrawals stack on top of it in the progressive brackets, so a
   * deferred withdrawal is taxed at the marginal rate above this base.
   */
  readonly baseOrdinaryIncome?: number;
}

export interface ProjectionInput {
  readonly startYear: number;
  readonly horizonYears: number;
  readonly assets: readonly ProjectionAssetInput[];
  readonly retirementYear: number;
  readonly annualSpending: number;
  readonly inflationPct: number;
  /** Legacy switch; when omitted, inflation is applied (use inflationPct 0 for none). */
  readonly applyInflation?: boolean;
  /** Spending profile: flat real budget (default) or Go-Go/Slow-Go/No-Go phases. */
  readonly spendingMode?: SpendingMode;
  /** Phase config when `spendingMode` is 'phased'. */
  readonly phasedSpending?: PhasedSpendingConfig;
  /** The user's age at `startYear`; required to map ages for the phased model. */
  readonly currentAge?: number;
  /** Cashflows tied to specific year(s) — one-off or recurring. */
  readonly expensesIncomes?: readonly ExpenseIncome[];
  /** Scheduled tax-deferred → tax-free conversions / meltdown. */
  readonly conversions?: readonly ConversionPlan[];
  /** Apply required minimum distributions (RMD/RRIF). Default true. */
  readonly rmdEnabled?: boolean;
  readonly scenario: ScenarioConfig;
  /** Canadian province for the combined bracket schedule (default ON). */
  readonly province?: Province;
  /** Tax envelopes. Empty/omitted => no tax (gross withdrawal equals net). */
  readonly accounts?: readonly ProjectionAccountInput[];
  /**
   * Raw accounts for dynamic cost-basis tracking. When present, the engine tracks
   * each asset's basis year by year and recomputes the capital-gains tax from the
   * live gain fraction (value−basis)/value instead of the static cost-basis share.
   */
  readonly rawAccounts?: readonly Account[];
  /** Account ids in draw-down order (top first). Unlisted accounts drain last. */
  readonly accountOrder?: readonly string[];
  /** Tax residence — drives the progressive brackets for auto-mode accounts. */
  readonly residence?: Country;
  /**
   * Units of plan currency per unit of the residence country's local currency
   * (see WithdrawalContext.fxFactor). Default 1 — thresholds applied as-is.
   */
  readonly taxFxFactor?: number;
  /** Optional decay of high CAGRs toward a mature rate over the projection. */
  readonly growthFade?: GrowthFadeConfig;
}

/** Minimal shape the withdrawal routine needs (shared with the Monte Carlo engine). */
export interface WithdrawableAsset {
  value: number;
  readonly accountId: string | null;
  /** Cost basis, tracked alongside value so withdrawals realise gains pro-rata. */
  basis?: number;
  /** False = illiquid: excluded from every withdrawal and from surplus reinvestment. */
  readonly drawable?: boolean;
}

interface AssetRunState extends WithdrawableAsset {
  readonly holdingId: string;
  readonly symbol: string;
  /** Post-scenario-adjustment expected CAGR (percent); faded per year if enabled. */
  readonly cagrPct: number;
  readonly annualContribution: number;
  basis: number;
}

export const UNASSIGNED = '__unassigned__';

export interface WithdrawalResult {
  readonly gross: number;
  readonly net: number;
  readonly tax: number;
}

const clamp99 = (r: number): number => Math.min(Math.max(Number.isFinite(r) ? r : 0, 0), 0.99);

/**
 * Withdraw a net target from the portfolio, grossing up for each account's tax.
 * Mutates `state[i].value`. Accounts are drained strictly in `accountOrder`
 * (top first), then any remaining buckets, then the unassigned bucket.
 *
 * Tax is settled progressively across the year: deferred-account withdrawals
 * (and included capital gains) accumulate ordinary income taxed by the residence
 * brackets; flat buckets (capital-gains flat, or legacy manual rates) gross up in
 * closed form. Foreign withholding is credited (max with residence tax). When an
 * account carries no progressive profile, this reduces exactly to the old flat
 * gross-up — so existing behaviour is unchanged.
 */
export const withdrawNet = (
  state: WithdrawableAsset[],
  netTarget: number,
  accounts: readonly ProjectionAccountInput[] | undefined,
  accountOrder: readonly string[] | undefined,
  ctx?: WithdrawalContext,
): WithdrawalResult => {
  if (netTarget <= 0) return { gross: 0, net: 0, tax: 0 };

  // Legacy / no-tax path: gross equals net, drawn pro-rata across all DRAWABLE
  // holdings (illiquid assets are never sold).
  if (!accounts || accounts.length === 0) {
    const drawables = state.filter((a) => a.drawable !== false);
    const available = drawables.reduce((s, a) => s + a.value, 0);
    const gross = Math.min(netTarget, available);
    if (gross > 0 && available > 0) {
      const sold = gross / available;
      for (const a of drawables) {
        if (a.basis !== undefined) a.basis *= 1 - sold;
        a.value = Math.max(0, a.value - gross * (a.value / available));
      }
    }
    return { gross, net: gross, tax: 0 };
  }

  const byId = new Map(accounts.map((a) => [a.id, a]));

  interface Bucket {
    key: string;
    incomeCoef: number;
    gainsCoef: number;
    flatRate: number;
    withholding: number;
    value: number;
    members: WithdrawableAsset[];
  }
  const buckets = new Map<string, Bucket>();
  for (const a of state) {
    if (a.drawable === false) continue; // illiquid: never enters a withdrawal bucket
    const key = a.accountId ?? UNASSIGNED;
    const acc = key === UNASSIGNED ? undefined : byId.get(key);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        incomeCoef: ctx ? Math.max(acc?.incomeCoef ?? 0, 0) : 0,
        gainsCoef: ctx ? Math.max(acc?.gainsCoef ?? 0, 0) : 0,
        flatRate: clamp99(acc?.flatRate ?? acc?.effectiveTaxRate ?? 0),
        withholding: clamp99(acc?.withholding ?? 0),
        value: 0,
        members: [],
      };
      buckets.set(key, bucket);
    }
    bucket.value += a.value;
    bucket.members.push(a);
  }

  // Draw order: configured order first, then any remaining accounts, unassigned last.
  const drawKeys: string[] = [];
  for (const id of accountOrder ?? [])
    if (buckets.has(id) && !drawKeys.includes(id)) drawKeys.push(id);
  for (const key of buckets.keys()) {
    if (key !== UNASSIGNED && !drawKeys.includes(key)) drawKeys.push(key);
  }
  if (buckets.has(UNASSIGNED)) drawKeys.push(UNASSIGNED);

  const country = ctx?.residence ?? 'US';
  const province = ctx?.province;
  const infl = ctx?.inflationFactor ?? 1;
  const fx = ctx?.fxFactor ?? 1;
  // Seed with non-portfolio ordinary income so withdrawals stack on top of it.
  let ordinaryIncome = Math.max(0, ctx?.baseOrdinaryIncome ?? 0);
  // Capital gains realised so far this year (they stack in the US LTCG ladder).
  let gainsIncome = 0;
  let need = netTarget;
  let grossTotal = 0;

  for (const key of drawKeys) {
    if (need <= 0.005) break;
    const b = buckets.get(key)!;
    if (b.value <= 0) continue;

    let take: number;
    let netDelivered: number;

    if (b.incomeCoef <= 0 && b.gainsCoef <= 0) {
      // Flat bucket: closed-form gross-up (exact). Withholding is credited (max).
      const eff = clamp99(Math.max(b.flatRate, b.withholding));
      const grossWanted = need / (1 - eff);
      take = Math.min(grossWanted, b.value);
      netDelivered = take * (1 - eff);
    } else {
      // Progressive bucket: bisection on gross (net is monotonic increasing).
      // Delta form: this bucket owes the increase over what the year's income
      // already owed — which also reprices earlier gains when a later bucket
      // raises the ordinary floor beneath the LTCG ladder.
      const baseTax = incomeTax(ordinaryIncome, country, infl, province, fx);
      const baseCgTax = capitalGainsTax(gainsIncome, ordinaryIncome, country, infl, fx);
      const netFromGross = (g: number): number => {
        const ord = ordinaryIncome + g * b.incomeCoef;
        const incTax = incomeTax(ord, country, infl, province, fx) - baseTax;
        const cgTax =
          capitalGainsTax(gainsIncome + g * b.gainsCoef, ord, country, infl, fx) - baseCgTax;
        const tax = Math.max(incTax + cgTax + g * b.flatRate, g * b.withholding);
        return g - tax;
      };
      if (netFromGross(b.value) <= need) {
        take = b.value;
        netDelivered = netFromGross(b.value);
      } else {
        let lo = 0;
        let hi = b.value;
        for (let i = 0; i < 40; i += 1) {
          const mid = (lo + hi) / 2;
          if (netFromGross(mid) < need) lo = mid;
          else hi = mid;
        }
        take = hi;
        netDelivered = netFromGross(hi);
      }
      ordinaryIncome += take * b.incomeCoef;
      gainsIncome += take * b.gainsCoef;
    }

    if (take <= 0) continue;
    const soldFraction = b.value > 0 ? take / b.value : 0;
    for (const m of b.members) {
      if (m.basis !== undefined) m.basis *= 1 - soldFraction;
      m.value = Math.max(0, m.value - take * (m.value / b.value));
    }
    grossTotal += take;
    need -= netDelivered;
  }

  const netD = netTarget - Math.max(0, need);
  return { gross: grossTotal, net: netD, tax: grossTotal - netD };
};

/**
 * Reserved holding used for the `'cash'` proceeds-reinvest mode: property sale
 * proceeds parked here sit as cash (no growth, no volatility) and fund later
 * spending. Seeded at value 0 by {@link buildProjectionInput}/`buildMonteCarloInput`
 * only when a sale opts into it, and recognised by symbol in {@link reinvestSurplus}.
 */
export const CASH_RESERVE_SYMBOL = 'CASH:RE';
export const CASH_RESERVE_HOLDING_ID = 'cash:re';

/**
 * Route this year's reinvested surplus to its destination:
 *  - `'spread'`  — across all drawable holdings, pro-rata by value (equal split
 *                  when the portfolio is depleted, so the money still lands).
 *  - `'cash'`    — into the reserved cash bucket at `cashIndex` (no growth).
 *  - `null`      — legacy single-sink (untagged surplus: RMD, one-off income).
 * Falls back to the single sink when the requested destination is unavailable.
 * Mutates `state`. Shared by the deterministic and Monte Carlo engines.
 */
export const reinvestSurplus = (
  state: WithdrawableAsset[],
  surplus: number,
  mode: 'spread' | 'cash' | null,
  kindOf: (accountId: string | null) => AccountKind | undefined,
  cashIndex: number,
): void => {
  if (surplus <= 0) return;
  if (mode === 'cash' && cashIndex >= 0) {
    const cash = state[cashIndex];
    if (cash) {
      cash.value += surplus;
      cash.basis = (cash.basis ?? 0) + surplus;
      return;
    }
  }
  if (mode === 'spread') {
    const drawables = state.filter((a) => a.drawable !== false);
    if (drawables.length > 0) {
      const total = drawables.reduce((s, a) => s + a.value, 0);
      for (const a of drawables) {
        const share = total > 0 ? surplus * (a.value / total) : surplus / drawables.length;
        a.value += share;
        a.basis = (a.basis ?? 0) + share;
      }
      return;
    }
  }
  const sink =
    state.find((a) => a.drawable !== false && kindOf(a.accountId) === 'taxable') ??
    state.find((a) => a.drawable !== false && kindOf(a.accountId) !== 'tax_deferred');
  if (sink) {
    sink.value += surplus;
    sink.basis = (sink.basis ?? 0) + surplus;
  }
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Future value at year end of a constant end-of-month contribution invested for
 * 12 months at the asset's annual growth factor (monthly-compounded). This lets
 * each monthly contribution earn the asset's CAGR within the year it is made,
 * not only from the following year.
 */
export const futureValueOfContributions = (monthly: number, growthFactor: number): number => {
  const annual = monthly * 12;
  if (monthly <= 0) return 0;
  if (growthFactor <= 0) return annual; // CAGR <= -100%: no meaningful growth
  const monthlyRate = Math.pow(growthFactor, 1 / 12) - 1;
  if (Math.abs(monthlyRate) < 1e-9) return annual; // flat growth
  return (monthly * (Math.pow(1 + monthlyRate, 12) - 1)) / monthlyRate;
};

/** Total cash contributed over `years` of a monthly contribution (no growth). */
export const totalContributed = (monthly: number, years: number): number =>
  Math.max(0, monthly) * 12 * Math.max(0, years);

/**
 * Future value, at the retirement year, of contributing `monthly` for `years`
 * years at `annualCagrPct` — with the same intra-year monthly compounding the
 * projection uses. This is the "with CAGR" figure shown in the savings modal.
 */
export const contributionFutureValue = (
  monthly: number,
  annualCagrPct: number,
  years: number,
): number => {
  if (monthly <= 0 || years <= 0) return 0;
  const growthFactor = 1 + annualCagrPct / 100;
  const fvOneYear = futureValueOfContributions(monthly, growthFactor);
  if (Math.abs(growthFactor - 1) < 1e-9) return fvOneYear * years;
  // Each year's year-end amount compounds for the remaining years.
  return (fvOneYear * (Math.pow(growthFactor, years) - 1)) / (growthFactor - 1);
};

/**
 * Project a portfolio year by year for a single scenario.
 *
 * Methodology (documented in the UI "calculation details" block):
 *  - Each asset compounds at its own effective CAGR = base CAGR + scenario adjustment.
 *  - Within a year: opening -> growth (incl. contributions) -> withdrawal -> closing.
 *  - During the accumulation phase (year < retirementYear), each asset's monthly
 *    contribution is invested and compounded intra-year, so contributions earn
 *    the asset's CAGR in the same year they are made.
 *  - Withdrawals begin in `retirementYear` and are inflated from `startYear` when enabled.
 *  - Each withdrawal is grossed up for tax (residence brackets + account type), then
 *    drained account-by-account in `accountOrder`, pro-rata across the holdings within
 *    each account. With no accounts/tax this reduces to a pro-rata draw across all holdings.
 */
export const project = (input: ProjectionInput, scenarioKey: ScenarioKey): Projection => {
  const adjustment = scenarioAdjustmentPts(input.scenario, scenarioKey);
  const inflationRate = (input.applyInflation ?? true) ? input.inflationPct / 100 : 0;
  const residence = input.residence ?? 'US';
  const taxFx = input.taxFxFactor ?? 1;

  // Account kind by id (for RMD targeting and reinvesting RMD surplus).
  const kindById = new Map((input.accounts ?? []).map((a) => [a.id, a.kind]));
  const kindOf = (accountId: string | null): AccountKind | undefined =>
    accountId ? kindById.get(accountId) : undefined;
  const conversions = input.conversions ?? [];
  const rmdEnabled = input.rmdEnabled ?? true;
  const hasForcedFlows = conversions.length > 0 || rmdEnabled;

  // Dynamic cost-basis mode: when raw accounts are provided, track each asset's
  // basis and recompute the capital-gains tax from the live gain fraction.
  const rawAccounts = input.rawAccounts ?? [];
  const dynamicBasis = rawAccounts.length > 0;
  const rawById = new Map(rawAccounts.map((a) => [a.id, a]));
  const basisPctOf = (accountId: string | null): number =>
    accountId ? (rawById.get(accountId)?.costBasisPct ?? 0) / 100 : 0;

  // Build the per-account tax profiles for a year from the live basis of `state`.
  const accountsForYear = (): readonly ProjectionAccountInput[] | undefined => {
    if (!dynamicBasis) return input.accounts;
    const agg = new Map<string, { v: number; b: number }>();
    for (const a of state) {
      if (!a.accountId) continue;
      const e = agg.get(a.accountId) ?? { v: 0, b: 0 };
      e.v += a.value;
      e.b += a.basis;
      agg.set(a.accountId, e);
    }
    return rawAccounts.map((acc) => {
      const e = agg.get(acc.id);
      const gain = e && e.v > 0 ? Math.min(1, Math.max(0, (e.v - e.b) / e.v)) : undefined;
      const p = accountTaxProfile(acc, residence, gain);
      return {
        id: acc.id,
        kind: acc.kind ?? 'taxable',
        effectiveTaxRate: accountEffectiveRate(acc, residence),
        incomeCoef: p.incomeCoef,
        gainsCoef: p.gainsCoef,
        flatRate: p.flatRate,
        withholding: p.withholding,
      };
    });
  };

  const fade = input.growthFade ?? DEFAULT_GROWTH_FADE;
  // Birth year (when the age is known) drives the US RMD start age (SECURE 2.0).
  const birthYear =
    input.currentAge && input.currentAge > 0 ? input.startYear - input.currentAge : null;

  // Real (inflation-stripped) multiplier on the budget for a given year offset,
  // driven by the Go-Go/Slow-Go/No-Go phases. 1.0 in linear mode or when the age
  // is unknown.
  const spendingReal = (offset: number): number => {
    if (input.spendingMode !== 'phased' || !input.phasedSpending) return 1;
    const age = input.currentAge && input.currentAge > 0 ? input.currentAge + offset : null;
    if (age === null) return 1;
    return realSpendingMultiplier(age, input.phasedSpending);
  };

  const state: AssetRunState[] = input.assets.map((a) => ({
    holdingId: a.holdingId,
    symbol: a.symbol,
    value: a.startValue,
    cagrPct: a.baseCagrPct + adjustment,
    annualContribution: a.annualContribution,
    accountId: a.accountId ?? null,
    drawable: a.drawable,
    // Initial basis: explicit cost basis, else the account's static basis share.
    basis: a.costBasis ?? a.startValue * basisPctOf(a.accountId ?? null),
  }));

  const cashIndex = state.findIndex((a) => a.symbol === CASH_RESERVE_SYMBOL);

  const years: ProjectionYear[] = [];
  let depletionYear: number | null = null;

  for (let offset = 0; offset <= input.horizonYears; offset += 1) {
    const year = input.startYear + offset;
    const isRetired = year >= input.retirementYear;

    const openingBalance = state.reduce((sum, a) => sum + a.value, 0);
    const openingByAsset = new Map(state.map((a) => [a.holdingId, a.value]));
    // Snapshot the deferred balance before growth: this year's opening balance is
    // last year's close, i.e. the 31 December figure the RMD divisor applies to.
    const rmdBase = deferredBalance(state, kindOf);

    // Growth on the existing balance, plus contributions made during the year
    // (accumulation phase). Monthly contributions are compounded intra-year at
    // the asset's monthly-equivalent CAGR, so they earn growth the same year.
    //  - `appreciation`       = growth on the opening balance only.
    //  - `contribution`       = cash invested this year (no growth).
    //  - `contributionValue`  = that cash plus its intra-year CAGR growth.
    // The projection table shows `contributionValue`, so the CAGR on
    // contributions is visible rather than hidden inside appreciation.
    let appreciation = 0;
    let contribution = 0;
    let contributionValue = 0;
    const apprecByAsset = new Map<string, number>();
    const contribByAsset = new Map<string, number>();
    for (const a of state) {
      // This year's growth factor, after applying the optional fade to high CAGRs.
      const growthFactor = 1 + fadedCagrPct(a.cagrPct, offset, fade) / 100;
      const baseGrowth = a.value * (growthFactor - 1);
      a.value += baseGrowth;
      appreciation += baseGrowth;
      apprecByAsset.set(a.holdingId, baseGrowth);

      if (!isRetired && a.annualContribution > 0) {
        const fv = futureValueOfContributions(a.annualContribution / 12, growthFactor);
        a.value += fv;
        a.basis += a.annualContribution; // contributed cash is cost basis
        contribution += a.annualContribution;
        contributionValue += fv;
        contribByAsset.set(a.holdingId, fv);
      }
    }
    const balanceAfterAppreciation = openingBalance + appreciation;

    // Withdrawal. The NET lifestyle figure is entered in TODAY's money and is
    // inflated from the start year, so the nominal need at each retirement year
    // reflects real purchasing power (a 10-years-out retirement costs more in
    // nominal terms than today). The engine grosses it up for account taxes, so
    // the GROSS amount removed from the portfolio funds the configured net.
    const inflationFactor = Math.pow(1 + inflationRate, offset);
    const netTarget = isRetired ? input.annualSpending * spendingReal(offset) * inflationFactor : 0;

    // Expense/income flows (home purchase/sale, inheritance, tuition, rental,
    // pension…) fire in their target year(s) regardless of retirement status.
    const flows = expenseIncomeAmountsForYear(input.expensesIncomes, year, inflationFactor);

    // Ordinary income base for the year: taxable flow income (pension, rental,
    // periodic consulting…). It stacks *beneath* deferred-account withdrawals
    // (and RMD/conversions) in the progressive brackets, so a deferred withdrawal
    // is taxed at the marginal rate above this base. Non-taxable flow income
    // (e.g. an inheritance) is added back as pure net cash.
    const ordinaryBase = flows.taxableIncome;
    const ordinaryTax = incomeTax(ordinaryBase, residence, inflationFactor, input.province, taxFx);
    const nonTaxableFlowIncome = flows.income - flows.taxableIncome;
    const otherNet = ordinaryBase - ordinaryTax + nonTaxableFlowIncome;

    // Forced tax-advantaged flows (Roth conversions / meltdown + RMD). These run
    // before spending: conversions move principal deferred→tax-free (taxed now),
    // RMD forces a taxable withdrawal from deferred. Both stack under spending in
    // the brackets; the RMD's net cash funds spending (surplus is reinvested).
    const age = input.currentAge && input.currentAge > 0 ? input.currentAge + offset : null;
    let convTax = 0;
    let rmdTax = 0;
    let rmdNet = 0;
    let rmdGross = 0;
    let forcedBase = ordinaryBase;
    if (isRetired && hasForcedFlows) {
      const forced = applyForcedFlows(state, kindOf, {
        residence,
        age,
        birthYear,
        rmdEnabled,
        conversions,
        inflationFactor,
        rmdBase,
      });
      const c = forced.conversionIncome;
      rmdGross = forced.rmdGross;
      // Stack in the order the flows actually happen: the mandatory RMD sits on
      // the flow income, and the discretionary conversion pays the marginal rate
      // above it — the honest price to attribute to a conversion strategy.
      const t0 = ordinaryTax;
      const tR = incomeTax(
        ordinaryBase + rmdGross,
        residence,
        inflationFactor,
        input.province,
        taxFx,
      );
      const tC = incomeTax(
        ordinaryBase + rmdGross + c,
        residence,
        inflationFactor,
        input.province,
        taxFx,
      );
      rmdTax = tR - t0;
      convTax = tC - tR;
      rmdNet = rmdGross - rmdTax;
      forcedBase = ordinaryBase + rmdGross + c;
    }

    // Cash the household has before touching the portfolio for spending, and the
    // cash it must raise (spending + the conversion tax due this year + flow
    // expenses). Flow income is already folded into `otherNet` above (net of tax
    // for the taxable portion).
    const cashAvailable = otherNet + rmdNet;
    const cashNeed = netTarget + convTax + flows.expense;
    const needFromPortfolio = Math.max(0, cashNeed - cashAvailable);

    // Surplus cash (RMD beyond spending, or one-off income beyond need) stays
    // invested. Property sale proceeds carry a reinvest mode (spread across the
    // portfolio, or a non-growing cash bucket); other surplus uses the sink.
    const surplus = Math.max(0, cashAvailable - cashNeed);
    reinvestSurplus(
      state,
      surplus,
      saleReinvestModeForYear(input.expensesIncomes, year, inflationFactor),
      kindOf,
      cashIndex,
    );

    const withdrawal = withdrawNet(
      state,
      needFromPortfolio,
      accountsForYear(),
      input.accountOrder,
      {
        residence,
        province: input.province,
        inflationFactor,
        fxFactor: taxFx,
        baseOrdinaryIncome: forcedBase,
      },
    );

    const closingBalance = state.reduce((sum, a) => sum + a.value, 0);

    // Deplete when the portfolio can no longer fund what is asked of it. Not
    // gated on retirement: a pre-retirement flow the portfolio cannot cover (a
    // home purchase, say) is a shortfall the Monte Carlo already counts as a
    // failure, and the two engines must not disagree on what "funded" means.
    if (
      depletionYear === null &&
      needFromPortfolio > 0 &&
      withdrawal.net < needFromPortfolio - 0.5
    ) {
      depletionYear = year;
    }

    years.push({
      year,
      openingBalance: round2(openingBalance),
      appreciation: round2(appreciation),
      balanceAfterAppreciation: round2(balanceAfterAppreciation),
      contribution: round2(contribution),
      contributionValue: round2(contributionValue),
      lifestyleSpending: round2(Math.min(netTarget, otherNet + rmdNet + withdrawal.net)),
      flowExpense: round2(flows.expense),
      flowIncome: round2(flows.income),
      grossWithdrawal: round2(withdrawal.gross + rmdGross),
      taxPaid: round2(withdrawal.tax + convTax + rmdTax),
      flowIncomeTax: round2(ordinaryTax),
      closingBalance: round2(closingBalance),
      isRetired,
      perAsset: state.map((a) => {
        const opening = openingByAsset.get(a.holdingId) ?? 0;
        const appr = apprecByAsset.get(a.holdingId) ?? 0;
        return {
          holdingId: a.holdingId,
          symbol: a.symbol,
          opening: round2(opening),
          appreciation: round2(appr),
          afterAppreciation: round2(opening + appr),
          contributionValue: round2(contribByAsset.get(a.holdingId) ?? 0),
          value: round2(a.value),
        };
      }),
    });
  }

  const yearsOfSurvival =
    depletionYear === null ? null : Math.max(0, depletionYear - input.retirementYear);

  return { scenario: scenarioKey, years, depletionYear, yearsOfSurvival };
};

/** Convenience: project the three scenarios at once for comparison charts. */
export const projectAllScenarios = (input: ProjectionInput): Record<ScenarioKey, Projection> => ({
  conservative: project(input, 'conservative'),
  expected: project(input, 'expected'),
  optimistic: project(input, 'optimistic'),
});
