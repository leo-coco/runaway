import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useSyncExternalStore } from 'react';
import { createPlansSlice, type PlansSlice } from './plansSlice';
import { createUiSlice, type UiSlice } from './uiSlice';
import type { Plan } from '@/domain/plan';
import { sanitizeAccountTaxFields } from '@/domain/account';
import { DEFAULT_PROVINCE } from '@/domain/country';
import { isSandboxPathname, planStorageKeyForPathname } from './planStorage';
import { createEmptySandboxPlan, createSandboxPlan, type SandboxProfileId } from './seed';

export type AppStore = PlansSlice & UiSlice;

const currentPathname = typeof window === 'undefined' ? '/' : window.location.pathname;
const sandboxMode = isSandboxPathname(currentPathname);

/**
 * Persisted-plan schema version. Shared by the localStorage `persist` config and
 * the server sync layer (sent as `schemaVersion` when a plan is pushed), so both
 * agree on which migration a stored plan needs.
 */
export const PLANS_SCHEMA_VERSION = 11;

const langForPathname = (pathname: string): 'en' | 'fr' =>
  pathname.startsWith('/fr/') ? 'fr' : 'en';

const initialPlans = sandboxMode
  ? [createSandboxPlan(langForPathname(currentPathname))]
  : undefined;

// Zustand deliberately leaves `hasHydrated()` false when reading, parsing, or
// migrating persisted state throws. Track that failure separately so a broken
// local cache cannot keep the authenticated app on its splash forever. The
// server remains the source of truth for signed-in accounts.
let storeHydrationFailed = false;
const storeHydrationListeners = new Set<() => void>();

const notifyStoreHydrationListeners = (): void => {
  for (const listener of storeHydrationListeners) listener();
};

const trackStoreHydration = () => {
  storeHydrationFailed = false;
  notifyStoreHydrationListeners();

  return (_state: AppStore | undefined, error: unknown): void => {
    if (error) {
      storeHydrationFailed = true;
      console.error(
        '[store] localStorage hydration failed; continuing with in-memory state.',
        error,
      );
    }
    notifyStoreHydrationListeners();
  };
};

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
      // v11: ExpenseIncome.category added — optional, absent reads as 'general',
      // so existing flows need no backfill (the spread above preserves them).
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
      ...createPlansSlice(initialPlans)(...a),
      ...createUiSlice(...a),
    }),
    {
      // The sandbox uses its own persisted plans. Opening it from an active
      // account can therefore never expose or mutate that account's local copy.
      name: planStorageKeyForPathname(currentPathname),
      version: PLANS_SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ plans: state.plans }),
      migrate: (persisted) => migratePersisted(persisted),
      onRehydrateStorage: trackStoreHydration,
      merge: (persisted, current) => {
        // Zustand passes `undefined` when the storage key does not exist. This
        // is the normal first-visit path, not an invalid persisted payload.
        const stored = (persisted ?? {}) as Partial<AppStore>;
        return {
          ...current,
          ...stored,
          plans: Array.isArray(stored.plans) ? stored.plans : current.plans,
        };
      },
    },
  ),
);

/**
 * Seed the Sandbox with its demo plan on first visit, through `persist`'s own
 * public API rather than by hand-writing its storage envelope.
 *
 * Persist only writes after a state mutation, so without an explicit seed the
 * in-memory default regenerates a new plan id on every reload while the dedicated
 * Sandbox key stays empty. Driving the seed with `setState` makes persist write
 * it through its own serializer, so a future Zustand upgrade can't silently
 * desync the on-disk format. No-op outside the Sandbox and when a plan is already
 * stored. Call once from the client entry, where the sandbox mode is known.
 */
/**
 * True once `persist` has finished rehydrating from localStorage. Lets callers
 * avoid rendering against the empty in-memory default (e.g. `RootRedirect`
 * routing to the "no plans" screen) before the real persisted plans load.
 */
const subscribeToStoreHydration = (onStoreChange: () => void): (() => void) => {
  storeHydrationListeners.add(onStoreChange);
  const unsubscribeHydrate = useAppStore.persist.onHydrate(onStoreChange);
  const unsubscribeFinish = useAppStore.persist.onFinishHydration(onStoreChange);
  return () => {
    storeHydrationListeners.delete(onStoreChange);
    unsubscribeHydrate();
    unsubscribeFinish();
  };
};

const getStoreHydrationSnapshot = (): boolean =>
  useAppStore.persist.hasHydrated() || storeHydrationFailed;

export const useStoreHydrated = (): boolean =>
  useSyncExternalStore(subscribeToStoreHydration, getStoreHydrationSnapshot, () => false);

export const seedSandboxIfEmpty = (pathname: string): void => {
  if (typeof window === 'undefined' || !isSandboxPathname(pathname)) return;
  const key = planStorageKeyForPathname(pathname);
  try {
    if (localStorage.getItem(key) !== null) return;
    useAppStore.persist.setOptions({ name: key });
    useAppStore.setState({ plans: [createSandboxPlan(langForPathname(pathname))] });
  } catch {
    // The Sandbox still works in-memory if browser storage is unavailable.
  }
};

export const seedSandboxProfile = (pathname: string, profileId: SandboxProfileId): void => {
  if (typeof window === 'undefined' || !isSandboxPathname(pathname)) return;
  const key = planStorageKeyForPathname(pathname);
  try {
    useAppStore.persist.setOptions({ name: key });
    useAppStore.setState({
      plans: [createSandboxPlan(langForPathname(pathname), profileId)],
    });
  } catch {
    useAppStore.setState({
      plans: [createSandboxPlan(langForPathname(pathname), profileId)],
    });
  }
};

export const seedEmptySandbox = (pathname: string): void => {
  if (typeof window === 'undefined' || !isSandboxPathname(pathname)) return;
  const key = planStorageKeyForPathname(pathname);
  const plan = createEmptySandboxPlan(langForPathname(pathname));
  try {
    useAppStore.persist.setOptions({ name: key });
    useAppStore.setState({ plans: [plan] });
  } catch {
    useAppStore.setState({ plans: [plan] });
  }
};
