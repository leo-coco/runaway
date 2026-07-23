import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { Holding } from '@/domain/asset';
import type { Plan } from '@/domain/plan';
import { createPlansSlice, type PlansSlice } from './plansSlice';
import { createSeedPlan } from './seed';

const makeStore = (plans?: Plan[]) => createStore<PlansSlice>()(createPlansSlice(plans));

const overrideKey = (a: string, b: string) => [a, b].sort().join('|');

const mkHolding = (accountId: string | null = null): Holding => ({
  id: `h-${Math.random().toString(36).slice(2)}`,
  instrument: {
    id: 'yahoo:VOO',
    symbol: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    assetClass: 'us_equity',
    exchange: 'NYSE Arca',
    nativeCurrency: 'USD',
  },
  quantity: 1,
  pricePerUnit: 500,
  expectedCagrPct: 5,
  monthlyContribution: 0,
  accountId,
});

describe('duplicatePlan', () => {
  it('returns null for an unknown plan id', () => {
    const store = makeStore();
    expect(store.getState().duplicatePlan('nope')).toBeNull();
    expect(store.getState().plans).toHaveLength(1);
  });

  it('regenerates holding ids but keeps their account assignment', () => {
    const store = makeStore();
    const source = store.getState().plans[0]!;
    const copyId = store.getState().duplicatePlan(source.id)!;
    const copy = store.getState().plans.find((p) => p.id === copyId)!;

    expect(copy.holdings).toHaveLength(source.holdings.length);
    const sourceIds = new Set(source.holdings.map((h) => h.id));
    for (const [i, holding] of copy.holdings.entries()) {
      expect(sourceIds.has(holding.id)).toBe(false);
      expect(holding.accountId).toBe(source.holdings[i]!.accountId);
    }
    expect(copy.accounts).toEqual(source.accounts);
    expect(copy.name).toBe(`${source.name} (copy)`);
  });

  it('remaps correlationOverrides onto the new holding ids', () => {
    const seed = createSeedPlan();
    const [a, b] = seed.holdings;
    const store = makeStore([
      { ...seed, correlationOverrides: { [overrideKey(a!.id, b!.id)]: -0.5 } },
    ]);

    const copyId = store.getState().duplicatePlan(seed.id)!;
    const copy = store.getState().plans.find((p) => p.id === copyId)!;
    const [ca, cb] = copy.holdings;

    expect(copy.correlationOverrides).toEqual({ [overrideKey(ca!.id, cb!.id)]: -0.5 });
  });

  it('drops overrides whose keys reference holdings that no longer exist', () => {
    const seed = createSeedPlan();
    const [a, b] = seed.holdings;
    const store = makeStore([
      {
        ...seed,
        correlationOverrides: {
          [overrideKey(a!.id, b!.id)]: 0.3,
          [overrideKey('ghost-1', 'ghost-2')]: 0.9,
        },
      },
    ]);

    const copyId = store.getState().duplicatePlan(seed.id)!;
    const copy = store.getState().plans.find((p) => p.id === copyId)!;
    const [ca, cb] = copy.holdings;

    expect(copy.correlationOverrides).toEqual({ [overrideKey(ca!.id, cb!.id)]: 0.3 });
  });
});

describe('createPlan', () => {
  it('starts a regular plan with one locked taxable account matching the residence', () => {
    const store = makeStore();
    const id = store.getState().createPlan('Test', false, 'FR');
    const plan = store.getState().plans.find((p) => p.id === id)!;

    expect(plan.accounts).toHaveLength(1);
    expect(plan.accounts[0]).toMatchObject({ kind: 'taxable', custom: false, sourceCountry: 'FR' });
    expect(plan.withdrawalOrder).toEqual([plan.accounts[0]!.id]);
    expect(plan.residenceCountry).toBe('FR');
  });

  it('starts a free-demo plan with the single tax-free sandbox account', () => {
    const store = makeStore();
    const id = store.getState().createPlan('Free', true);
    const plan = store.getState().plans.find((p) => p.id === id)!;

    expect(plan.accounts).toHaveLength(1);
    expect(plan.accounts[0]).toMatchObject({ kind: 'tax_free', custom: true });
  });
});

describe('setPlanCurrency', () => {
  it('leaves the tax residence and the accounts alone', () => {
    const store = makeStore();
    const id = store.getState().createPlan('Test', false, 'US');
    const before = store.getState().plans.find((p) => p.id === id)!;

    store.getState().setPlanCurrency(id, 'EUR', 0.92);

    const after = store.getState().plans.find((p) => p.id === id)!;
    expect(after.currency).toBe('EUR');
    expect(after.residenceCountry).toBe('US');
    expect(after.accounts).toEqual(before.accounts);
  });

  it('rescales every amount the plan stores in its own currency', () => {
    const store = makeStore();
    const id = store.getState().createPlan('Test', false, 'US');
    store.getState().updateSettings(id, {
      ...store.getState().plans.find((p) => p.id === id)!.settings,
      annualSpending: 60_000,
      expensesIncomes: [
        {
          id: 'pension',
          name: 'Pension',
          amount: 20_000,
          year: 2040,
          kind: 'income',
          taxableAmounts: { 2040: 15_000 },
        },
      ],
    });
    store.getState().setHome(id, {
      id: 'home',
      name: 'Home',
      currentValue: 500_000,
      appreciationPct: 2,
      mortgage: { balance: 200_000, ratePct: 3, termYearsRemaining: 20 },
    });

    store.getState().setPlanCurrency(id, 'EUR', 0.92);

    const after = store.getState().plans.find((p) => p.id === id)!;
    expect(after.settings.annualSpending).toBe(55_200);
    expect(after.settings.expensesIncomes![0]!.amount).toBe(18_400);
    expect(after.settings.expensesIncomes![0]!.taxableAmounts).toEqual({ 2040: 13_800 });
    expect(after.home!.currentValue).toBe(460_000);
    expect(after.home!.mortgage!.balance).toBe(184_000);
  });

  it('relabels without converting when the factor is 1', () => {
    const store = makeStore();
    const id = store.getState().createPlan('Test', false, 'US');
    const before = store.getState().plans.find((p) => p.id === id)!;

    store.getState().setPlanCurrency(id, 'EUR', 1);

    const after = store.getState().plans.find((p) => p.id === id)!;
    expect(after.currency).toBe('EUR');
    expect(after.settings).toEqual(before.settings);
  });
});

describe('addHolding', () => {
  it('auto-assigns to the sole account when the holding has no account', () => {
    const store = makeStore();
    const id = store.getState().createPlan();
    const plan = store.getState().plans.find((p) => p.id === id)!;

    store.getState().addHolding(id, mkHolding(null));

    const after = store.getState().plans.find((p) => p.id === id)!;
    expect(after.holdings[0]!.accountId).toBe(plan.accounts[0]!.id);
  });

  it('keeps an explicit (valid) account assignment', () => {
    const store = makeStore();
    const plan = store.getState().plans[0]!; // seed: 3 accounts
    const target = plan.accounts[1]!.id;

    store.getState().addHolding(plan.id, mkHolding(target));

    const after = store.getState().plans.find((p) => p.id === plan.id)!;
    expect(after.holdings.at(-1)!.accountId).toBe(target);
  });

  it('assigns to the first envelope when no account is given (multi-account)', () => {
    const store = makeStore();
    const plan = store.getState().plans[0]!; // seed: 3 accounts

    store.getState().addHolding(plan.id, mkHolding(null));

    const after = store.getState().plans.find((p) => p.id === plan.id)!;
    // Never left unassigned: it falls back to the first account.
    expect(after.holdings.at(-1)!.accountId).toBe(plan.accounts[0]!.id);
  });

  it('routes a non-drawable asset to a lazily-created illiquid bucket', () => {
    const store = makeStore();
    const plan = store.getState().plans[0]!;
    expect(plan.accounts.some((a) => a.illiquid)).toBe(false);

    store.getState().addHolding(plan.id, { ...mkHolding(null), drawable: false });

    const after = store.getState().plans.find((p) => p.id === plan.id)!;
    const bucket = after.accounts.find((a) => a.illiquid);
    expect(bucket).toBeDefined();
    expect(after.holdings.at(-1)!.accountId).toBe(bucket!.id);
    // The bucket is never drawn, so it stays out of the withdrawal order.
    expect(after.withdrawalOrder).not.toContain(bucket!.id);
  });

  it('prunes the illiquid bucket when its last holding is removed', () => {
    const store = makeStore();
    const plan = store.getState().plans[0]!;
    const holding = { ...mkHolding(null), drawable: false as const };
    store.getState().addHolding(plan.id, holding);

    const withBucket = store.getState().plans.find((p) => p.id === plan.id)!;
    expect(withBucket.accounts.some((a) => a.illiquid)).toBe(true);

    store.getState().removeHolding(plan.id, holding.id);

    const after = store.getState().plans.find((p) => p.id === plan.id)!;
    expect(after.accounts.some((a) => a.illiquid)).toBe(false);
  });
});

describe('addAccount / removeAccount', () => {
  it('appends the new account to the withdrawal order', () => {
    const store = makeStore();
    const plan = store.getState().plans[0]!;

    const accountId = store.getState().addAccount(plan.id);

    const after = store.getState().plans.find((p) => p.id === plan.id)!;
    expect(after.accounts.map((a) => a.id)).toContain(accountId);
    expect(after.withdrawalOrder.at(-1)).toBe(accountId);
  });

  it('never removes the last account', () => {
    const store = makeStore();
    const id = store.getState().createPlan();
    const plan = store.getState().plans.find((p) => p.id === id)!;

    store.getState().removeAccount(id, plan.accounts[0]!.id);

    const after = store.getState().plans.find((p) => p.id === id)!;
    expect(after.accounts).toHaveLength(1);
  });

  it('re-homes holdings and purges the withdrawal order on removal', () => {
    const store = makeStore();
    const plan = store.getState().plans[0]!; // seed: 3 accounts, holdings assigned
    const removed = plan.accounts[0]!.id;
    const affected = plan.holdings.filter((h) => h.accountId === removed);
    expect(affected.length).toBeGreaterThan(0);

    store.getState().removeAccount(plan.id, removed);

    const after = store.getState().plans.find((p) => p.id === plan.id)!;
    expect(after.accounts.map((a) => a.id)).not.toContain(removed);
    expect(after.withdrawalOrder).not.toContain(removed);
    // Holdings are never left unassigned: they fall back to the first envelope.
    const fallbackId = after.accounts[0]!.id;
    for (const h of affected) {
      expect(after.holdings.find((x) => x.id === h.id)!.accountId).toBe(fallbackId);
    }
  });
});

describe('saveAccountsTaxConfig', () => {
  it('commits accounts and residence atomically while reconciling dependent data', () => {
    const store = makeStore();
    const plan = store.getState().plans[0]!;
    const removedId = plan.accounts[0]!.id;
    const affectedHoldingIds = plan.holdings
      .filter((holding) => holding.accountId === removedId)
      .map((holding) => holding.id);
    const retained = { ...plan.accounts[1]!, name: 'Edited account' };
    const added = { ...plan.accounts[2]!, id: 'draft-account', name: 'Draft account' };

    store.getState().saveAccountsTaxConfig(plan.id, {
      accounts: [retained, added],
      residenceCountry: 'CA',
      residenceProvince: 'QC',
    });

    const after = store.getState().plans.find((candidate) => candidate.id === plan.id)!;
    expect(after.accounts.map((account) => account.id)).toEqual([retained.id, added.id]);
    expect(after.accounts[0]!.name).toBe('Edited account');
    expect(after.residenceCountry).toBe('CA');
    expect(after.residenceProvince).toBe('QC');
    expect(after.withdrawalOrder).toEqual([retained.id, added.id]);
    // Holdings whose account was dropped are re-homed to the first remaining
    // envelope, never left unassigned.
    for (const holdingId of affectedHoldingIds) {
      expect(after.holdings.find((holding) => holding.id === holdingId)!.accountId).toBe(
        retained.id,
      );
    }
  });
});

describe('updateAccount', () => {
  it('clamps out-of-range tax percentages before they reach the engines', () => {
    const store = makeStore();
    const plan = store.getState().plans[0]!;
    const accountId = plan.accounts[0]!.id;

    store.getState().updateAccount(plan.id, accountId, { costBasisPct: 250, taxRatePct: 120 });

    const after = store.getState().plans.find((p) => p.id === plan.id)!;
    const account = after.accounts.find((a) => a.id === accountId)!;
    expect(account.costBasisPct).toBe(100);
    expect(account.taxRatePct).toBe(99);
  });
});

describe('setCorrelation', () => {
  it('clamps to [-1, 1] and stores under an order-independent key', () => {
    const store = makeStore();
    const plan = store.getState().plans[0]!;
    const [a, b] = plan.holdings;

    store.getState().setCorrelation(plan.id, b!.id, a!.id, -3);

    const after = store.getState().plans.find((p) => p.id === plan.id)!;
    expect(after.correlationOverrides).toEqual({ [overrideKey(a!.id, b!.id)]: -1 });

    store.getState().resetCorrelations(plan.id);
    expect(store.getState().plans.find((p) => p.id === plan.id)!.correlationOverrides).toEqual({});
  });
});

describe('addConversion', () => {
  it('returns null when the plan has no tax-deferred account', () => {
    const store = makeStore();
    const id = store.getState().createPlan(); // one taxable account only
    expect(store.getState().addConversion(id)).toBeNull();
  });

  it('creates a deferred-to-tax-free conversion when both kinds exist', () => {
    const store = makeStore();
    const id = store.getState().createPlan();
    const deferredId = store.getState().addAccount(id);
    store.getState().updateAccount(id, deferredId, { kind: 'tax_deferred' });
    const freeId = store.getState().addAccount(id);
    store.getState().updateAccount(id, freeId, { kind: 'tax_free' });

    const conversionId = store.getState().addConversion(id)!;

    const after = store.getState().plans.find((p) => p.id === id)!;
    const conversion = after.settings.conversions!.find((c) => c.id === conversionId)!;
    expect(conversion.fromAccountId).toBe(deferredId);
    expect(conversion.toAccountId).toBe(freeId);
  });
});
