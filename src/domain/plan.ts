import type { Account } from './account';
import type { Holding } from './asset';
import type { Home } from './home';
import type { CurrencyCode } from './money';
import { RESIDENCE_CURRENCY, type Country, type Province } from './country';
import type { RetirementSettings } from './retirementSettings';
import type { ScenarioConfig } from './scenario';

/** A complete saved retirement plan. This is the unit persisted by the store. */
export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly currency: CurrencyCode;
  readonly holdings: readonly Holding[];
  /**
   * Primary residence, if the plan models one. Not a holding: it never enters the
   * drawdown pool. Its purchase/mortgage/ownership/sale cashflows are generated as
   * expense/income flows and merged into the projection, and its equity is tracked
   * separately for the net-worth view.
   */
  readonly home?: Home;
  /** Tax envelopes holdings can be grouped into. Empty = no tax modelling. */
  readonly accounts: readonly Account[];
  /** Account ids in the order they are drained during retirement (top first). */
  readonly withdrawalOrder: readonly string[];
  /** Tax residence — drives the tax engine for auto-mode accounts. */
  readonly residenceCountry?: Country;
  /** Canadian province (combined bracket schedule); only meaningful when CA. */
  readonly residenceProvince?: Province;
  /**
   * User overrides for the Monte Carlo correlation between two holdings, keyed by
   * `${idA}|${idB}` with the two holding ids sorted. Absent pairs fall back to the
   * asset-class default. Symmetric (stored once per pair).
   */
  readonly correlationOverrides?: Record<string, number>;
  readonly settings: RetirementSettings;
  readonly scenario: ScenarioConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Every currency the plan must be able to convert to price itself: its own
 * reference currency, each holding's native currency, and the residence's local
 * currency (whose tax brackets are legislated in it and scaled into plan money).
 * An FX table missing any of these cannot value the plan.
 */
export const planCurrencies = (plan: Plan): readonly CurrencyCode[] => [
  plan.currency,
  RESIDENCE_CURRENCY[plan.residenceCountry ?? 'US'],
  ...plan.holdings.map((h) => h.instrument.nativeCurrency),
];
