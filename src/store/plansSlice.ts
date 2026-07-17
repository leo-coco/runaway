import type { StateCreator } from 'zustand';
import type { Plan } from '@/domain/plan';
import type { Holding } from '@/domain/asset';
import type { Home } from '@/domain/home';
import type { RentalProperty } from '@/domain/rentalProperty';
import type { Account, AccountPreset } from '@/domain/account';
import type { Country, Province } from '@/domain/country';
import type { CurrencyCode } from '@/domain/money';
import type { RetirementSettings } from '@/domain/retirementSettings';
import type { ExpenseIncome } from '@/domain/expenseIncome';
import type { ConversionPlan } from '@/domain/taxAdvantaged';
import type { ScenarioConfig } from '@/domain/scenario';
import { DEFAULT_RETIREMENT_SETTINGS } from '@/domain/retirementSettings';
import { DEFAULT_SCENARIO_CONFIG } from '@/domain/scenario';
import {
  accountFromPreset,
  BASE_TAXABLE_PRESET,
  defaultFreeAccount,
  defaultTaxableAccount,
  sanitizeAccountTaxFields,
} from '@/domain/account';
import { DEFAULT_PROVINCE, residenceForCurrency } from '@/domain/country';
import { newId } from '@/lib/id';
import { createSeedPlan } from './seed';

export interface PlansSlice {
  plans: Plan[];

  /** Replace the whole plan list. Used to hydrate from the server on sign-in. */
  hydratePlans: (plans: Plan[]) => void;

  /**
   * Create a plan. `freeDemo` picks the free-tier default account (a single
   * tax-free "My account" sandbox) instead of the honest taxable baseline
   * premium gets; callers decide based on the caller's own entitlements.
   */
  createPlan: (name?: string, freeDemo?: boolean, residenceCountry?: Country) => string;
  duplicatePlan: (id: string) => string | null;
  deletePlan: (id: string) => void;
  renamePlan: (id: string, name: string, description: string) => void;
  setPlanCurrency: (id: string, currency: CurrencyCode) => void;

  addHolding: (planId: string, holding: Holding) => void;
  updateHolding: (
    planId: string,
    holdingId: string,
    patch: Partial<
      Pick<
        Holding,
        | 'quantity'
        | 'pricePerUnit'
        | 'expectedCagrPct'
        | 'monthlyContribution'
        | 'accountId'
        | 'volatilityPct'
        | 'costBasis'
        | 'drawable'
      >
    >,
  ) => void;
  removeHolding: (planId: string, holdingId: string) => void;

  addAccount: (planId: string, preset?: AccountPreset) => string;
  updateAccount: (
    planId: string,
    accountId: string,
    patch: Partial<
      Pick<
        Account,
        | 'name'
        | 'taxRatePct'
        | 'taxableBasePct'
        | 'kind'
        | 'sourceCountry'
        | 'taxMode'
        | 'costBasisPct'
      >
    >,
  ) => void;
  removeAccount: (planId: string, accountId: string) => void;
  /** Atomically commit the accounts/tax-residence draft from the accounts modal. */
  saveAccountsTaxConfig: (
    planId: string,
    config: {
      accounts: readonly Account[];
      residenceCountry: Country;
      residenceProvince: Province;
    },
  ) => void;
  setWithdrawalOrder: (planId: string, order: string[]) => void;
  setResidenceCountry: (planId: string, country: Country) => void;
  /** Apply the account tax residence to every saved plan. */
  setAllResidenceCountries: (country: Country) => void;
  /** Canadian province for the combined bracket schedule (CA residence only). */
  setResidenceProvince: (planId: string, province: Province) => void;
  /** Override the Monte Carlo correlation between two holdings (−1…1, symmetric). */
  setCorrelation: (planId: string, holdingIdA: string, holdingIdB: string, value: number) => void;
  /** Clear all correlation overrides, restoring the asset-class defaults. */
  resetCorrelations: (planId: string) => void;

  updateSettings: (planId: string, settings: RetirementSettings) => void;
  updateScenario: (planId: string, scenario: ScenarioConfig) => void;

  /** Set (create or replace) the plan's home. */
  setHome: (planId: string, home: Home) => void;
  /** Remove the plan's home. */
  removeHome: (planId: string) => void;

  /** Add a rental property; returns its id. */
  addProperty: (planId: string, data: Omit<RentalProperty, 'id'>) => string;
  /** Update an existing rental property in place. */
  updateProperty: (
    planId: string,
    propertyId: string,
    patch: Partial<Omit<RentalProperty, 'id'>>,
  ) => void;
  /** Remove a rental property. */
  removeProperty: (planId: string, propertyId: string) => void;

  /** Add a cashflow (home purchase/sale, inheritance, tuition, pension…); returns its id. */
  addExpenseIncome: (planId: string, data: Omit<ExpenseIncome, 'id'>) => string;
  updateExpenseIncome: (
    planId: string,
    expenseId: string,
    patch: Partial<Omit<ExpenseIncome, 'id'>>,
  ) => void;
  removeExpenseIncome: (planId: string, expenseId: string) => void;

  /** Toggle required minimum distributions (RMD/RRIF). */
  setRmdEnabled: (planId: string, enabled: boolean) => void;
  /** Add a conversion / meltdown plan; returns its id (null if no eligible accounts). */
  addConversion: (planId: string) => string | null;
  updateConversion: (
    planId: string,
    conversionId: string,
    patch: Partial<Omit<ConversionPlan, 'id'>>,
  ) => void;
  removeConversion: (planId: string, conversionId: string) => void;
}

const touch = (plan: Plan, mutate: (p: Plan) => Plan): Plan => ({
  ...mutate(plan),
  updatedAt: new Date().toISOString(),
});

const emptyPlan = (name: string, freeDemo = false, preferredResidence?: Country): Plan => {
  const now = new Date().toISOString();
  const currency: CurrencyCode = 'USD';
  const residenceCountry = preferredResidence ?? residenceForCurrency(currency);
  // Free plans start with a single tax-free "My account" sandbox; everyone else starts
  // with one basic taxable account matching the residence, so assets have an
  // envelope and tax is modelled from the start.
  const base = freeDemo ? defaultFreeAccount() : defaultTaxableAccount(residenceCountry);
  return {
    id: newId(),
    name,
    description: '',
    currency,
    holdings: [],
    accounts: [base],
    withdrawalOrder: [base.id],
    residenceCountry,
    settings: { ...DEFAULT_RETIREMENT_SETTINGS },
    scenario: { ...DEFAULT_SCENARIO_CONFIG },
    createdAt: now,
    updatedAt: now,
  };
};

/** Is this the auto-created default base account (locked, taxable, auto)? */
const isDefaultBase = (a: Account): boolean =>
  a.custom === false && a.kind === 'taxable' && a.taxMode === 'auto';

export const createPlansSlice =
  (initialPlans: Plan[] = [createSeedPlan()]): StateCreator<PlansSlice, [], [], PlansSlice> =>
  (set, get) => ({
    plans: initialPlans,

    hydratePlans: (plans) => set({ plans }),

    createPlan: (name = 'Untitled plan', freeDemo = false, residenceCountry) => {
      const plan = emptyPlan(name, freeDemo, residenceCountry);
      set((s) => ({ plans: [...s.plans, plan] }));
      return plan.id;
    },

    duplicatePlan: (id) => {
      const source = get().plans.find((p) => p.id === id);
      if (!source) return null;
      const now = new Date().toISOString();
      const holdingIdMap = new Map(source.holdings.map((h) => [h.id, newId()]));
      // Correlation overrides are keyed by holding-id pairs, so they must follow
      // the regenerated ids; keys referencing unknown holdings are dropped.
      const remapOverrides = (overrides: Record<string, number>): Record<string, number> =>
        Object.fromEntries(
          Object.entries(overrides).flatMap(([key, value]) => {
            const [a, b] = key.split('|');
            const na = holdingIdMap.get(a ?? '');
            const nb = holdingIdMap.get(b ?? '');
            return na && nb ? [[[na, nb].sort().join('|'), value]] : [];
          }),
        );
      const copy: Plan = {
        ...source,
        id: newId(),
        name: `${source.name} (copy)`,
        holdings: source.holdings.map((h) => ({ ...h, id: holdingIdMap.get(h.id)! })),
        ...(source.correlationOverrides
          ? { correlationOverrides: remapOverrides(source.correlationOverrides) }
          : {}),
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({ plans: [...s.plans, copy] }));
      return copy.id;
    },

    deletePlan: (id) => set((s) => ({ plans: s.plans.filter((p) => p.id !== id) })),

    renamePlan: (id, name, description) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === id ? touch(p, (x) => ({ ...x, name, description })) : p,
        ),
      })),

    setPlanCurrency: (id, currency) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === id
            ? touch(p, (x) => {
                // Currency implies a tax residence; re-point the sole default base
                // account to the new country (keep its id so holdings stay assigned).
                const residenceCountry = residenceForCurrency(currency);
                const sole = x.accounts.length === 1 ? x.accounts[0] : undefined;
                const accounts =
                  sole && isDefaultBase(sole)
                    ? [{ ...sole, ...BASE_TAXABLE_PRESET[residenceCountry] }]
                    : x.accounts;
                return { ...x, currency, residenceCountry, accounts };
              })
            : p,
        ),
      })),

    addHolding: (planId, holding) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => {
                // Auto-assign to the sole account so tax is modelled without manual steps.
                const sole = x.accounts.length === 1 ? x.accounts[0]!.id : null;
                const h =
                  holding.accountId == null && sole ? { ...holding, accountId: sole } : holding;
                return { ...x, holdings: [...x.holdings, h] };
              })
            : p,
        ),
      })),

    updateHolding: (planId, holdingId, patch) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                holdings: x.holdings.map((h) => (h.id === holdingId ? { ...h, ...patch } : h)),
              }))
            : p,
        ),
      })),

    removeHolding: (planId, holdingId) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({ ...x, holdings: x.holdings.filter((h) => h.id !== holdingId) }))
            : p,
        ),
      })),

    addAccount: (planId, preset) => {
      let accountId = '';
      set((s) => ({
        plans: s.plans.map((p) => {
          if (p.id !== planId) return p;
          const account = accountFromPreset(preset, p.residenceCountry ?? 'US');
          accountId = account.id;
          return touch(p, (x) => ({
            ...x,
            accounts: [...x.accounts, account],
            // Append the new account to the end of the draw-down order.
            withdrawalOrder: [...x.withdrawalOrder, account.id],
          }));
        }),
      }));
      return accountId;
    },

    updateAccount: (planId, accountId, patch) =>
      set((s) => {
        // Single write choke point for account tax fields: clamp out-of-range
        // percents (e.g. costBasisPct 250) before they reach the engines.
        const clean = sanitizeAccountTaxFields(patch);
        return {
          plans: s.plans.map((p) =>
            p.id === planId
              ? touch(p, (x) => ({
                  ...x,
                  accounts: x.accounts.map((a) => (a.id === accountId ? { ...a, ...clean } : a)),
                }))
              : p,
          ),
        };
      }),

    removeAccount: (planId, accountId) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          // A plan always keeps at least one account, so holdings never end up
          // orphaned by deleting the last envelope.
          p.id === planId && p.accounts.length > 1
            ? touch(p, (x) => ({
                ...x,
                accounts: x.accounts.filter((a) => a.id !== accountId),
                withdrawalOrder: x.withdrawalOrder.filter((id) => id !== accountId),
                // Unassign holdings that referenced the removed account.
                holdings: x.holdings.map((h) =>
                  h.accountId === accountId ? { ...h, accountId: null } : h,
                ),
              }))
            : p,
        ),
      })),

    saveAccountsTaxConfig: (planId, config) =>
      set((s) => ({
        plans: s.plans.map((p) => {
          if (p.id !== planId || config.accounts.length === 0) return p;

          const accounts = config.accounts.map((account) =>
            sanitizeAccountTaxFields({ ...account }),
          );
          const accountIds = new Set(accounts.map((account) => account.id));
          const retainedOrder = p.withdrawalOrder.filter((id) => accountIds.has(id));
          const orderedIds = new Set(retainedOrder);
          const withdrawalOrder = [
            ...retainedOrder,
            ...accounts.map((account) => account.id).filter((id) => !orderedIds.has(id)),
          ];

          return touch(p, (x) => ({
            ...x,
            accounts,
            withdrawalOrder,
            residenceCountry: config.residenceCountry,
            residenceProvince:
              config.residenceCountry === 'CA' ? config.residenceProvince : x.residenceProvince,
            holdings: x.holdings.map((holding) =>
              holding.accountId && !accountIds.has(holding.accountId)
                ? { ...holding, accountId: null }
                : holding,
            ),
          }));
        }),
      })),

    setWithdrawalOrder: (planId, order) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId ? touch(p, (x) => ({ ...x, withdrawalOrder: order })) : p,
        ),
      })),

    setResidenceCountry: (planId, country) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                residenceCountry: country,
                // Switching to Canada needs a province for the combined brackets.
                residenceProvince:
                  country === 'CA'
                    ? (x.residenceProvince ?? DEFAULT_PROVINCE)
                    : x.residenceProvince,
              }))
            : p,
        ),
      })),

    setAllResidenceCountries: (country) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          touch(p, (x) => ({
            ...x,
            residenceCountry: country,
            residenceProvince:
              country === 'CA' ? (x.residenceProvince ?? DEFAULT_PROVINCE) : x.residenceProvince,
          })),
        ),
      })),

    setResidenceProvince: (planId, province) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId ? touch(p, (x) => ({ ...x, residenceProvince: province })) : p,
        ),
      })),

    setCorrelation: (planId, holdingIdA, holdingIdB, value) =>
      set((s) => ({
        plans: s.plans.map((p) => {
          if (p.id !== planId) return p;
          const key = [holdingIdA, holdingIdB].sort().join('|');
          const clamped = Math.min(1, Math.max(-1, value));
          return touch(p, (x) => ({
            ...x,
            correlationOverrides: { ...(x.correlationOverrides ?? {}), [key]: clamped },
          }));
        }),
      })),

    resetCorrelations: (planId) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId ? touch(p, (x) => ({ ...x, correlationOverrides: {} })) : p,
        ),
      })),

    updateSettings: (planId, settings) =>
      set((s) => ({
        plans: s.plans.map((p) => (p.id === planId ? touch(p, (x) => ({ ...x, settings })) : p)),
      })),

    updateScenario: (planId, scenario) =>
      set((s) => ({
        plans: s.plans.map((p) => (p.id === planId ? touch(p, (x) => ({ ...x, scenario })) : p)),
      })),

    setHome: (planId, home) =>
      set((s) => ({
        plans: s.plans.map((p) => (p.id === planId ? touch(p, (x) => ({ ...x, home })) : p)),
      })),

    removeHome: (planId) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => {
                const { home: _removed, ...rest } = x;
                return rest;
              })
            : p,
        ),
      })),

    addProperty: (planId, data) => {
      const property: RentalProperty = { ...data, id: newId() };
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({ ...x, properties: [...(x.properties ?? []), property] }))
            : p,
        ),
      }));
      return property.id;
    },

    updateProperty: (planId, propertyId, patch) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                properties: (x.properties ?? []).map((prop) =>
                  prop.id === propertyId ? { ...prop, ...patch } : prop,
                ),
              }))
            : p,
        ),
      })),

    removeProperty: (planId, propertyId) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                properties: (x.properties ?? []).filter((prop) => prop.id !== propertyId),
              }))
            : p,
        ),
      })),

    addExpenseIncome: (planId, data) => {
      const expense: ExpenseIncome = { ...data, id: newId() };
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                settings: {
                  ...x.settings,
                  // New flow goes to the top of the list so it's immediately visible.
                  expensesIncomes: [expense, ...(x.settings.expensesIncomes ?? [])],
                },
              }))
            : p,
        ),
      }));
      return expense.id;
    },

    updateExpenseIncome: (planId, expenseId, patch) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                settings: {
                  ...x.settings,
                  expensesIncomes: (x.settings.expensesIncomes ?? []).map((e) =>
                    e.id === expenseId ? { ...e, ...patch } : e,
                  ),
                },
              }))
            : p,
        ),
      })),

    removeExpenseIncome: (planId, expenseId) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                settings: {
                  ...x.settings,
                  expensesIncomes: (x.settings.expensesIncomes ?? []).filter(
                    (e) => e.id !== expenseId,
                  ),
                },
              }))
            : p,
        ),
      })),

    setRmdEnabled: (planId, enabled) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({ ...x, settings: { ...x.settings, rmdEnabled: enabled } }))
            : p,
        ),
      })),

    addConversion: (planId) => {
      const plan = get().plans.find((p) => p.id === planId);
      if (!plan) return null;
      const deferred = plan.accounts.find((a) => (a.kind ?? 'taxable') === 'tax_deferred');
      const dest =
        plan.accounts.find((a) => (a.kind ?? 'taxable') === 'tax_free') ??
        plan.accounts.find((a) => a.id !== deferred?.id);
      if (!deferred || !dest) return null;
      const conversion: ConversionPlan = {
        id: newId(),
        fromAccountId: deferred.id,
        toAccountId: dest.id,
        annualAmount: 30_000,
        startAge: 65,
        endAge: 72,
      };
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                settings: {
                  ...x.settings,
                  conversions: [...(x.settings.conversions ?? []), conversion],
                },
              }))
            : p,
        ),
      }));
      return conversion.id;
    },

    updateConversion: (planId, conversionId, patch) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                settings: {
                  ...x.settings,
                  conversions: (x.settings.conversions ?? []).map((c) =>
                    c.id === conversionId ? { ...c, ...patch } : c,
                  ),
                },
              }))
            : p,
        ),
      })),

    removeConversion: (planId, conversionId) =>
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === planId
            ? touch(p, (x) => ({
                ...x,
                settings: {
                  ...x.settings,
                  conversions: (x.settings.conversions ?? []).filter((c) => c.id !== conversionId),
                },
              }))
            : p,
        ),
      })),
  });
