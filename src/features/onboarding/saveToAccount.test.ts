import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom here ships no localStorage; persist binds undefined and no-ops. Install a
// minimal in-memory Storage before the store module is imported (vi.hoisted runs
// first) so the bridge and these assertions read through the same global.
vi.hoisted(() => {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

import { bridgeSandboxPlanToAccount } from './saveToAccount';
import { createEmptySandboxPlan } from '@/store/seed';
import { ACCOUNT_PLANS_KEY } from '@/store/planStorage';
import type { Plan } from '@/domain/plan';

const readAccountPlans = (): Plan[] => {
  const raw = localStorage.getItem(ACCOUNT_PLANS_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { state?: { plans?: Plan[] } };
  return parsed.state?.plans ?? [];
};

describe('bridgeSandboxPlanToAccount', () => {
  beforeEach(() => {
    localStorage.removeItem(ACCOUNT_PLANS_KEY);
  });

  it('writes the plan into the account storage key envelope', () => {
    const plan = createEmptySandboxPlan('en');
    expect(bridgeSandboxPlanToAccount(plan)).toBe(true);
    const plans = readAccountPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]!.id).toBe(plan.id);
  });

  it('appends to existing account plans without dropping them', () => {
    const existing = createEmptySandboxPlan('en');
    const other = createEmptySandboxPlan('fr');
    bridgeSandboxPlanToAccount(existing);
    bridgeSandboxPlanToAccount(other);
    const ids = readAccountPlans().map((p) => p.id);
    expect(ids).toContain(existing.id);
    expect(ids).toContain(other.id);
    expect(ids).toHaveLength(2);
  });

  it('is idempotent: re-saving the same plan replaces rather than duplicates', () => {
    const plan = createEmptySandboxPlan('en');
    bridgeSandboxPlanToAccount(plan);
    bridgeSandboxPlanToAccount(plan);
    expect(readAccountPlans()).toHaveLength(1);
  });
});
