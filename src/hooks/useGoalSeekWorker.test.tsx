import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MC_OPTIONS, type MonteCarloInput } from '@/services/monteCarlo';
import {
  neutralLevers,
  type ActiveLeverKey,
  type BalanceResult,
  type LeverBounds,
} from '@/services/goalSeek';
import type { MonteCarloResponse } from '@/workers/monteCarlo.worker';
import { useGoalSeekBalance, useGoalSeekEval, type BalanceArgs } from './useGoalSeekWorker';

const input = (): MonteCarloInput => ({
  assets: [
    {
      startValue: 500_000,
      driftPct: 7,
      sigmaPct: 15,
      annualContribution: 0,
      accountId: 'a',
      assetClass: 'us_equity',
      symbol: 'VTI',
    },
  ],
  correlation: [[1]],
  accounts: [{ id: 'a', effectiveTaxRate: 0 }],
  accountOrder: ['a'],
  annualSpending: 40_000,
  inflationPct: 0,
  applyInflation: false,
  startYear: 2026,
  retirementYear: 2030,
  horizonYears: 30,
});

const options = { ...DEFAULT_MC_OPTIONS, seed: 7, runs: 30, retirementHorizon: 25 };
const bounds: LeverBounds = {
  baseSpending: 40_000,
  maxSavings: 2_000,
  maxRetireYears: 5,
  maxCapital: 100_000,
};
const unlocked: Record<ActiveLeverKey, boolean> = {
  spending: false,
  extraMonthlySavings: false,
  retireDelayYears: false,
  extraCapital: false,
};

const balanceArgs = (): BalanceArgs => ({
  input: input(),
  options,
  target: 0.9,
  locked: unlocked,
  current: neutralLevers(40_000),
  bounds,
  iterations: 30,
});

/**
 * Stand-in for a module Worker. jsdom provides none, which is exactly why the
 * hook carries a synchronous fallback — so both paths need covering, and only
 * this fake reaches the asynchronous one.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<MonteCarloResponse>) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  readonly posted: unknown[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  respond(data: MonteCarloResponse) {
    this.onmessage?.({ data } as MessageEvent<MonteCarloResponse>);
  }
  fail(message: string) {
    this.onerror?.({ message });
  }
}

const useFakeWorker = () => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
};

const latestWorker = () => FakeWorker.instances.at(-1)!;

const solved: BalanceResult = {
  levers: { ...neutralLevers(40_000), extraCapital: 25_000 },
  success: 0.92,
  reached: true,
};

afterEach(() => vi.unstubAllGlobals());

describe('useGoalSeekBalance without Worker support', () => {
  it('falls back to solving synchronously when the environment has no Worker', async () => {
    expect(typeof Worker).toBe('undefined');
    const { result } = renderHook(() => useGoalSeekBalance());

    let value: BalanceResult | null = null;
    await act(async () => {
      value = await result.current.solve(balanceArgs());
    });

    expect(value).toMatchObject({
      levers: expect.any(Object),
      success: expect.any(Number),
      reached: expect.any(Boolean),
    });
  });

  it('clears the balancing flag once the synchronous solve returns', async () => {
    const { result } = renderHook(() => useGoalSeekBalance());

    await act(async () => void (await result.current.solve(balanceArgs())));

    expect(result.current.balancing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('scores every lever mix when evaluating without a Worker', async () => {
    const { result } = renderHook(() => useGoalSeekEval());

    let rates: readonly number[] | null = null;
    await act(async () => {
      rates = await result.current.evaluate({
        input: input(),
        options,
        levers: [neutralLevers(40_000), { ...neutralLevers(40_000), extraCapital: 200_000 }],
        iterations: 30,
      });
    });

    expect(rates).toHaveLength(2);
    for (const rate of rates!) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });
});

describe('useGoalSeekBalance over a Worker', () => {
  it('posts the request to a worker and resolves with the extracted result', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let promise!: Promise<BalanceResult | null>;
    act(() => {
      promise = result.current.solve(balanceArgs());
    });

    expect(latestWorker().posted[0]).toMatchObject({ kind: 'balance', target: 0.9 });
    await act(async () => {
      latestWorker().respond({ ok: true, kind: 'balance', result: solved });
      await promise;
    });

    expect(await promise).toEqual(solved);
    expect(result.current.balancing).toBe(false);
  });

  it('marks itself busy while the worker is running', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let promise!: Promise<BalanceResult | null>;
    act(() => {
      promise = result.current.solve(balanceArgs());
    });

    await waitFor(() => expect(result.current.balancing).toBe(true));

    await act(async () => {
      latestWorker().respond({ ok: true, kind: 'balance', result: solved });
      await promise;
    });
    expect(result.current.balancing).toBe(false);
  });

  it('terminates the worker once it has answered', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let promise!: Promise<BalanceResult | null>;
    act(() => {
      promise = result.current.solve(balanceArgs());
    });
    const worker = latestWorker();
    await act(async () => {
      worker.respond({ ok: true, kind: 'balance', result: solved });
      await promise;
    });

    expect(worker.terminated).toBe(true);
  });

  it('surfaces an error response as a message and a null result', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let promise!: Promise<BalanceResult | null>;
    act(() => {
      promise = result.current.solve(balanceArgs());
    });
    await act(async () => {
      latestWorker().respond({ ok: false, error: 'simulation blew up' });
      await promise;
    });

    expect(await promise).toBeNull();
    expect(result.current.error).toBe('simulation blew up');
    expect(result.current.balancing).toBe(false);
  });

  it('surfaces a worker crash as an error', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let promise!: Promise<BalanceResult | null>;
    act(() => {
      promise = result.current.solve(balanceArgs());
    });
    await act(async () => {
      latestWorker().fail('worker died');
      await promise;
    });

    expect(await promise).toBeNull();
    expect(result.current.error).toBe('worker died');
  });

  it('falls back to a generic message when the crash carries none', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let promise!: Promise<BalanceResult | null>;
    act(() => {
      promise = result.current.solve(balanceArgs());
    });
    await act(async () => {
      latestWorker().fail('');
      await promise;
    });

    expect(result.current.error).toBe('Simulation worker failed');
  });

  it('clears a previous error when a new solve starts', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let first!: Promise<BalanceResult | null>;
    act(() => {
      first = result.current.solve(balanceArgs());
    });
    await act(async () => {
      latestWorker().respond({ ok: false, error: 'boom' });
      await first;
    });
    expect(result.current.error).toBe('boom');

    let second!: Promise<BalanceResult | null>;
    act(() => {
      second = result.current.solve(balanceArgs());
    });
    await waitFor(() => expect(result.current.error).toBeNull());

    await act(async () => {
      latestWorker().respond({ ok: true, kind: 'balance', result: solved });
      await second;
    });
  });
});

describe('useGoalSeekBalance supersede semantics', () => {
  it('terminates the in-flight worker when a newer solve starts', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let first!: Promise<BalanceResult | null>;
    act(() => {
      first = result.current.solve(balanceArgs());
    });
    const stale = latestWorker();

    let second!: Promise<BalanceResult | null>;
    act(() => {
      second = result.current.solve(balanceArgs());
    });
    const fresh = latestWorker();

    expect(stale.terminated).toBe(true);
    expect(fresh).not.toBe(stale);

    await act(async () => {
      fresh.respond({ ok: true, kind: 'balance', result: solved });
      await second;
    });
    expect(await second).toEqual(solved);
    void first;
  });

  it('drops a superseded answer instead of letting it overwrite the newer one', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let first!: Promise<BalanceResult | null>;
    act(() => {
      first = result.current.solve(balanceArgs());
    });
    const stale = latestWorker();

    let second!: Promise<BalanceResult | null>;
    act(() => {
      second = result.current.solve(balanceArgs());
    });
    const fresh = latestWorker();

    // The stale worker answers late; its result must not reach the caller.
    const staleResult: BalanceResult = { ...solved, success: 0.1, reached: false };
    await act(async () => {
      stale.respond({ ok: true, kind: 'balance', result: staleResult });
      await first;
    });
    expect(await first).toBeNull();

    await act(async () => {
      fresh.respond({ ok: true, kind: 'balance', result: solved });
      await second;
    });
    expect(await second).toEqual(solved);
  });

  it('ignores a response whose kind does not match the channel', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekBalance());

    let promise!: Promise<BalanceResult | null>;
    act(() => {
      promise = result.current.solve(balanceArgs());
    });
    const worker = latestWorker();

    // An 'eval' answer on the balance channel extracts to undefined: the channel
    // must keep waiting rather than resolve with nothing.
    await act(async () => {
      worker.respond({ ok: true, kind: 'eval', result: [0.5] });
    });
    expect(worker.terminated).toBe(false);

    await act(async () => {
      worker.respond({ ok: true, kind: 'balance', result: solved });
      await promise;
    });
    expect(await promise).toEqual(solved);
  });

  it('terminates the worker when the component unmounts mid-solve', async () => {
    useFakeWorker();
    const { result, unmount } = renderHook(() => useGoalSeekBalance());

    act(() => void result.current.solve(balanceArgs()));
    const worker = latestWorker();

    unmount();

    expect(worker.terminated).toBe(true);
  });
});

describe('useGoalSeekEval over a Worker', () => {
  it('posts an eval request and resolves the success rates in order', async () => {
    useFakeWorker();
    const { result } = renderHook(() => useGoalSeekEval());

    let promise!: Promise<readonly number[] | null>;
    act(() => {
      promise = result.current.evaluate({
        input: input(),
        options,
        levers: [neutralLevers(40_000)],
        iterations: 30,
      });
    });

    expect(latestWorker().posted[0]).toMatchObject({ kind: 'eval', iterations: 30 });
    await act(async () => {
      latestWorker().respond({ ok: true, kind: 'eval', result: [0.42, 0.81] });
      await promise;
    });

    expect(await promise).toEqual([0.42, 0.81]);
  });

  it('keeps its own channel, so a balance solve does not cancel an eval', async () => {
    useFakeWorker();
    const { result } = renderHook(() => ({
      balance: useGoalSeekBalance(),
      evaluation: useGoalSeekEval(),
    }));

    let evalPromise!: Promise<readonly number[] | null>;
    act(() => {
      evalPromise = result.current.evaluation.evaluate({
        input: input(),
        options,
        levers: [neutralLevers(40_000)],
        iterations: 30,
      });
    });
    const evalWorker = latestWorker();

    act(() => void result.current.balance.solve(balanceArgs()));

    expect(evalWorker.terminated).toBe(false);
    await act(async () => {
      evalWorker.respond({ ok: true, kind: 'eval', result: [0.7] });
      await evalPromise;
    });
    expect(await evalPromise).toEqual([0.7]);
  });
});
