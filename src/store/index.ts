import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createPlansSlice, type PlansSlice } from './plansSlice';
import { createUiSlice, type UiSlice } from './uiSlice';
import type { Plan } from '@/domain/plan';
import { sanitizeAccountTaxFields } from '@/domain/account';
import { DEFAULT_PROVINCE } from '@/domain/country';

export type AppStore = PlansSlice & UiSlice;

/**
 * Persisted-plan schema version. Shared by the localStorage `persist` config and
 * the server sync layer (sent as `schemaVersion` when a plan is pushed), so both
 * agree on which migration a stored plan needs.
 */
export const PLANS_SCHEMA_VERSION = 10;

/**
 * Backfill fields added after a plan was first persisted, so older saved plans
 * (e.g. from before per-asset monthly contributions existed) never produce NaN.
 */
const migratePersisted = (persisted: unknown): { plans: Plan[] } => {
  const state = persisted as { plans?: Plan[] };
  const plans = (state.plans ?? []).map((plan) => {
    // v8: settings.oneOffExpenses renamed to settings.expensesIncomes (the module
    // now also supports recurring flows, not just one-off) — read the legacy key
    // as a fallback so plans saved before the rename keep their flows.
    const legacySettings = plan.settings as unknown as {
      oneOffExpenses?: Plan['settings']['expensesIncomes'];
      // v9: the "Other income" module (age-based income streams) was folded into
      // expensesIncomes as recurring flows — read the legacy key defensively.
      incomeStreams?: readonly {
        id: string;
        name: string;
        annualAmount: number;
        startAge: number;
        endAge: number;
        inflate?: boolean;
        taxable?: boolean;
      }[];
    };
    const currentAge = plan.settings.currentAge ?? 40;
    const nowYear = new Date().getFullYear();
    // Convert age-based income streams to year-based recurring flows. A stream
    // whose age can't be dated (unknown current age) is dropped — same as the
    // old otherIncomeForYear, which never applied it without a known age.
    const migratedIncomeFlows =
      currentAge > 0
        ? (legacySettings.incomeStreams ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            amount: s.annualAmount,
            year: nowYear + (s.startAge - currentAge),
            endYear: nowYear + (s.endAge - currentAge),
            kind: 'income' as const,
            frequency: 'recurring' as const,
            inflate: s.inflate,
            taxable: s.taxable,
          }))
        : [];
    const residenceCountry = plan.residenceCountry ?? 'US';
    return {
      ...plan,
      // v7: tax residence added — default to US (only affects auto-mode accounts).
      residenceCountry,
      // v10: Canadian province drives the combined bracket schedule — backfill ON.
      residenceProvince:
        plan.residenceProvince ?? (residenceCountry === 'CA' ? DEFAULT_PROVINCE : undefined),
      // v3: tax envelopes added — default to none and leave holdings unassigned.
      // v7: existing accounts keep their flat rate via `manual` mode (no change).
      // v10: clamp out-of-range tax percents (defence against corrupted saves).
      accounts: (plan.accounts ?? []).map((a) =>
        sanitizeAccountTaxFields({ ...a, taxMode: a.taxMode ?? 'manual' }),
      ),
      // v5: persisted draw-down order — default to the accounts' order.
      withdrawalOrder: plan.withdrawalOrder ?? (plan.accounts ?? []).map((a) => a.id),
      // v4: current age added for age annotations on the projection.
      // v6: life-expectancy age added — drives the Monte Carlo horizon.
      settings: {
        ...plan.settings,
        currentAge,
        lifeExpectancyAge: plan.settings.lifeExpectancyAge ?? 90,
        expensesIncomes: [
          ...(plan.settings.expensesIncomes ?? legacySettings.oneOffExpenses ?? []),
          ...migratedIncomeFlows,
        ],
      },
      holdings: plan.holdings.map((h) => ({
        ...h,
        monthlyContribution: h.monthlyContribution ?? 0,
        accountId: h.accountId ?? null,
      })),
    };
  });
  return { plans };
};

/**
 * Global store composed from feature slices. Only plan data is persisted to
 * localStorage; transient UI state (open modal) is intentionally excluded.
 */
export const useAppStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createPlansSlice(...a),
      ...createUiSlice(...a),
    }),
    {
      name: 'retire-on-model/plans',
      version: PLANS_SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ plans: state.plans }),
      migrate: (persisted) => migratePersisted(persisted),
    },
  ),
);
