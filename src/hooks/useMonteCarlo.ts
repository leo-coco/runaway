import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Plan } from '@/domain/plan';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import {
  DEFAULT_MC_OPTIONS,
  buildMonteCarloInput,
  runMonteCarlo,
  type MonteCarloInput,
  type MonteCarloOptions,
  type MonteCarloResult,
} from '@/services/monteCarlo';
import type { MonteCarloRequest, MonteCarloResponse } from '@/workers/monteCarlo.worker';
import type { RatesTable } from '@/services/currencyService';

export type MonteCarloStatus = 'idle' | 'running' | 'done' | 'error';

export interface UseMonteCarloResult {
  readonly status: MonteCarloStatus;
  readonly result: MonteCarloResult | null;
  readonly error: string | null;
  /** Current RNG seed driving the run (so callers can reproduce the same paths). */
  readonly seed: number;
  /** Re-run the simulation with a fresh random seed. */
  readonly rerun: () => void;
}

/** Does this environment support module Web Workers? (Not jsdom / SSR.) */
const supportsWorker = (): boolean => typeof Worker !== 'undefined';

/**
 * Run the Monte Carlo simulation off the main thread when enabled. Falls back to
 * a synchronous run when Web Workers are unavailable (e.g. jsdom tests). The heavy
 * input build and the run are gated on `enabled` so the modal only pays for it
 * when open. Inputs are memoised so identical plans don't re-trigger work.
 */
export const useMonteCarlo = (
  plan: Plan | undefined,
  rates: RatesTable | undefined,
  enabled: boolean,
  options: MonteCarloOptions = DEFAULT_MC_OPTIONS,
): UseMonteCarloResult => {
  const [status, setStatus] = useState<MonteCarloStatus>('idle');
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState(options.seed);
  const rerun = useCallback(() => setSeed((Math.random() * 0xffffffff) >>> 0), []);

  const startYear = new Date().getFullYear();

  // Simulate through the user's life expectancy. The plan must be funded from the
  // retirement year up to (and including) the year they reach lifeExpectancyAge.
  const effectiveOptions: MonteCarloOptions = useMemo(() => {
    const base = { ...options, seed };
    if (!plan) return base;
    const {
      currentAge,
      lifeExpectancyAge,
      retirementYear,
      monteCarloModel,
      btcHalvingCycle,
      monteCarloIterations,
      histStartYear,
    } = plan.settings;
    const endYear = lifeExpectancyYear(currentAge, startYear, lifeExpectancyAge);
    const retirementHorizon = Math.max(1, endYear - retirementYear + 1);
    return {
      ...base,
      retirementHorizon,
      model: monteCarloModel ?? 'bootstrap',
      btcCycle: btcHalvingCycle ?? false,
      iterations: monteCarloIterations ?? base.iterations,
      histStartYear,
    };
  }, [plan, options, seed, startYear]);

  const input: MonteCarloInput | null = useMemo(() => {
    if (!plan || !enabled) return null;
    const { currentAge, lifeExpectancyAge } = plan.settings;
    const endYear = lifeExpectancyYear(currentAge, startYear, lifeExpectancyAge);
    const horizonYears = Math.max(1, endYear - startYear);
    return buildMonteCarloInput(plan, rates, startYear, horizonYears);
  }, [plan, rates, enabled, startYear]);

  // Re-run whenever the (memoised) input or options change.
  const inputKey = useMemo(
    () => (input ? JSON.stringify({ input, options: effectiveOptions }) : ''),
    [input, effectiveOptions],
  );

  useEffect(() => {
    let cancelled = false;

    // Reset when there is nothing to simulate. Deferred so the effect body never
    // calls setState synchronously (which would cause cascading renders).
    if (!input) {
      queueMicrotask(() => {
        if (cancelled) return;
        setStatus('idle');
        setResult(null);
        setError(null);
      });
      return () => {
        cancelled = true;
      };
    }

    const begin = (): void => {
      if (cancelled) return;
      setStatus('running');
      setError(null);
    };

    // Main-thread fallback (tests / no Worker support).
    if (!supportsWorker()) {
      queueMicrotask(() => {
        begin();
        try {
          const r = runMonteCarlo(input, effectiveOptions);
          if (!cancelled) {
            setResult(r);
            setStatus('done');
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Simulation failed');
            setStatus('error');
          }
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const worker = new Worker(new URL('../workers/monteCarlo.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent<MonteCarloResponse>) => {
      if (cancelled) return;
      const data = event.data;
      if (data.ok && data.kind === 'run') {
        setResult(data.result);
        setStatus('done');
      } else if (!data.ok) {
        setError(data.error);
        setStatus('error');
      }
    };
    worker.onerror = (event) => {
      if (cancelled) return;
      setError(event.message || 'Simulation worker failed');
      setStatus('error');
    };

    const request: MonteCarloRequest = { kind: 'run', input, options: effectiveOptions };
    worker.postMessage(request);
    queueMicrotask(begin);

    return () => {
      cancelled = true;
      worker.terminate();
    };
    // inputKey captures input+options; options/input referenced inside are stable per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  return { status, result, error, seed, rerun };
};
