import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plan } from '@/domain/plan';
import { DEFAULT_MC_OPTIONS, type MonteCarloResult } from '@/services/monteCarlo';
import { createSeedPlan } from '@/store/seed';
import type { MonteCarloResponse } from '@/workers/monteCarlo.worker';
import { useMonteCarlo } from './useMonteCarlo';

// Small run count: this covers the hook's orchestration, not the simulation's
// numbers (src/services/monteCarlo.test.ts owns those).
const ITERATIONS = 20;
const options = { ...DEFAULT_MC_OPTIONS, seed: 11, iterations: ITERATIONS };

/**
 * Hoisted per test, never called inline in a render callback: seed plans carry
 * random ids, so a fresh one each render changes `inputKey` and restarts the
 * effect forever.
 *
 * `monteCarloIterations` must be clamped here, not left to `options`: the hook
 * prefers the plan's setting, and the seed plan asks for 5000. On the
 * synchronous fallback that is a multi-second main-thread run, which outlives
 * waitFor's default timeout on a loaded CI runner.
 */
const plan = (): Plan => {
  const seeded = createSeedPlan();
  return { ...seeded, settings: { ...seeded.settings, monteCarloIterations: ITERATIONS } };
};

/** Stand-in for a module Worker; jsdom has none, hence the hook's fallback path. */
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

const fakeResult = { successRate: 0.87 } as unknown as MonteCarloResult;

afterEach(() => vi.unstubAllGlobals());

describe('useMonteCarlo gating', () => {
  it('stays idle while disabled and runs nothing', async () => {
    const p = plan();
    useFakeWorker();

    const { result } = renderHook(() => useMonteCarlo(p, undefined, false, options));

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.result).toBeNull();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('stays idle without a plan', async () => {
    useFakeWorker();

    const { result } = renderHook(() => useMonteCarlo(undefined, undefined, true, options));

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('resets to idle when it becomes disabled after a run', async () => {
    let enabled = true;
    const p = plan();
    const { result, rerender } = renderHook(() => useMonteCarlo(p, undefined, enabled, options));
    await waitFor(() => expect(result.current.status).toBe('done'));

    enabled = false;
    rerender();

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.result).toBeNull();
  });
});

describe('useMonteCarlo without Worker support', () => {
  it('runs on the main thread and reports a result', async () => {
    const p = plan();
    expect(typeof Worker).toBe('undefined');

    const { result } = renderHook(() => useMonteCarlo(p, undefined, true, options));

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.result?.successRate).toBeGreaterThanOrEqual(0);
    expect(result.current.result?.successRate).toBeLessThanOrEqual(1);
    expect(result.current.error).toBeNull();
  });

  it('exposes the seed and swaps it on rerun', async () => {
    const p = plan();
    const { result } = renderHook(() => useMonteCarlo(p, undefined, true, options));
    await waitFor(() => expect(result.current.status).toBe('done'));
    const firstSeed = result.current.seed;
    expect(firstSeed).toBe(options.seed);

    act(() => result.current.rerun());

    await waitFor(() => expect(result.current.seed).not.toBe(firstSeed));
    await waitFor(() => expect(result.current.status).toBe('done'));
  });
});

describe('useMonteCarlo over a Worker', () => {
  it('posts a run request carrying the built input', async () => {
    const p = plan();
    useFakeWorker();

    renderHook(() => useMonteCarlo(p, undefined, true, options));

    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    expect(latestWorker().posted[0]).toMatchObject({ kind: 'run' });
  });

  it('reports running until the worker answers', async () => {
    const p = plan();
    useFakeWorker();
    const { result } = renderHook(() => useMonteCarlo(p, undefined, true, options));

    await waitFor(() => expect(result.current.status).toBe('running'));

    await act(async () => latestWorker().respond({ ok: true, kind: 'run', result: fakeResult }));
    expect(result.current.status).toBe('done');
    expect(result.current.result).toEqual(fakeResult);
  });

  it('surfaces an error response without clobbering it with a result', async () => {
    const p = plan();
    useFakeWorker();
    const { result } = renderHook(() => useMonteCarlo(p, undefined, true, options));
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));

    await act(async () => latestWorker().respond({ ok: false, error: 'simulation blew up' }));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('simulation blew up');
    expect(result.current.result).toBeNull();
  });

  it('surfaces a worker crash, with a generic message when none is given', async () => {
    const p = plan();
    useFakeWorker();
    const { result } = renderHook(() => useMonteCarlo(p, undefined, true, options));
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));

    await act(async () => latestWorker().fail(''));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Simulation worker failed');
  });

  it('ignores a response of an unexpected kind', async () => {
    const p = plan();
    useFakeWorker();
    const { result } = renderHook(() => useMonteCarlo(p, undefined, true, options));
    await waitFor(() => expect(result.current.status).toBe('running'));

    await act(async () => latestWorker().respond({ ok: true, kind: 'eval', result: [0.5] }));

    expect(result.current.status).toBe('running');
    expect(result.current.result).toBeNull();
  });

  it('terminates the previous worker when the input changes', async () => {
    useFakeWorker();
    let current = plan();
    const { rerender } = renderHook(() => useMonteCarlo(current, undefined, true, options));
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const stale = latestWorker();

    current = { ...current, settings: { ...current.settings, retirementYear: 2045 } };
    rerender();

    await waitFor(() => expect(FakeWorker.instances).toHaveLength(2));
    expect(stale.terminated).toBe(true);
  });

  it('does not restart the worker when the plan re-renders unchanged', async () => {
    useFakeWorker();
    const p = plan();
    const { rerender } = renderHook(() => useMonteCarlo(p, undefined, true, options));
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));

    rerender();
    rerender();

    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('terminates the worker on unmount and ignores a late answer', async () => {
    const p = plan();
    useFakeWorker();
    const { result, unmount } = renderHook(() => useMonteCarlo(p, undefined, true, options));
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = latestWorker();

    unmount();
    await act(async () => worker.respond({ ok: true, kind: 'run', result: fakeResult }));

    expect(worker.terminated).toBe(true);
    expect(result.current.result).toBeNull();
  });
});
