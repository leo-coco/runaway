import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// This jsdom setup ships no localStorage, so persist binds an undefined storage at
// import and silently no-ops. Install a minimal in-memory Storage before the store
// module is imported (vi.hoisted runs before imports) so persist and these
// assertions read through the same global.
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

import {
  PLANS_SCHEMA_VERSION,
  seedEmptySandbox,
  seedSandboxIfEmpty,
  seedSandboxProfile,
} from './index';
import { planStorageKeyForPathname } from './planStorage';

const SANDBOX_PATH = '/app/sandbox';
const sandboxKey = planStorageKeyForPathname(SANDBOX_PATH);

const readStored = (key: string): { state: { plans: unknown[] }; version: number } | null => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
};

describe('seedSandboxIfEmpty', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('seeds one plan through the persist envelope when the sandbox key is empty', () => {
    seedSandboxIfEmpty(SANDBOX_PATH);

    const stored = readStored(sandboxKey);
    expect(stored).not.toBeNull();
    // Locks the contract with persist's serialization format so a Zustand upgrade
    // that changes the envelope fails here instead of silently in the browser.
    expect(stored).toMatchObject({ version: PLANS_SCHEMA_VERSION });
    expect(stored?.state.plans).toHaveLength(1);
  });

  it('keeps the seeded plan id stable across reloads (does not overwrite)', () => {
    seedSandboxIfEmpty(SANDBOX_PATH);
    const firstId = (readStored(sandboxKey)?.state.plans[0] as { id: string }).id;

    // A second visit with the key already populated must not re-seed.
    seedSandboxIfEmpty(SANDBOX_PATH);
    const secondId = (readStored(sandboxKey)?.state.plans[0] as { id: string }).id;

    expect(secondId).toBe(firstId);
  });

  it('is a no-op outside the sandbox', () => {
    seedSandboxIfEmpty('/app');

    expect(localStorage.getItem(sandboxKey)).toBeNull();
    expect(localStorage.getItem(planStorageKeyForPathname('/app'))).toBeNull();
  });

  it('replaces the current sandbox with an explicitly selected profile', () => {
    seedSandboxIfEmpty(SANDBOX_PATH);
    seedSandboxProfile(SANDBOX_PATH, 'midlife_balanced');

    const plan = readStored(sandboxKey)?.state.plans[0] as {
      currency: string;
      settings: { currentAge: number };
    };
    expect(plan.currency).toBe('CAD');
    expect(plan.settings.currentAge).toBe(48);
  });

  it('replaces the current sandbox with an explicitly selected blank plan', () => {
    seedSandboxIfEmpty(SANDBOX_PATH);
    seedEmptySandbox(SANDBOX_PATH);

    const plan = readStored(sandboxKey)?.state.plans[0] as {
      currency: string;
      holdings: unknown[];
    };
    expect(plan.currency).toBe('USD');
    expect(plan.holdings).toEqual([]);
  });
});
