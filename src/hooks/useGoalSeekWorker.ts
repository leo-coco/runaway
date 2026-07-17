import { useCallback, useEffect, useRef, useState } from 'react';
import {
  balanceToTarget,
  evalSuccess,
  type ActiveLeverKey,
  type BalanceResult,
  type LeverBounds,
  type Levers,
} from '@/services/goalSeek';
import type { MonteCarloInput, MonteCarloOptions } from '@/services/monteCarlo';
import type { MonteCarloRequest, MonteCarloResponse } from '@/workers/monteCarlo.worker';

export interface BalanceArgs {
  readonly input: MonteCarloInput;
  readonly options: MonteCarloOptions;
  readonly target: number;
  readonly locked: Record<ActiveLeverKey, boolean>;
  readonly current: Levers;
  readonly bounds: LeverBounds;
  readonly iterations: number;
}

export interface EvalArgs {
  readonly input: MonteCarloInput;
  readonly options: MonteCarloOptions;
  readonly levers: readonly Levers[];
  readonly iterations: number;
}

/** Does this environment support module Web Workers? (Not jsdom / SSR.) */
const supportsWorker = (): boolean => typeof Worker !== 'undefined';

/**
 * One worker channel: at most one request in flight, a newer one superseding the
 * older (whose result is then dropped as stale). Each caller holds its own
 * channel, so an independent stream of requests never cancels another's — the
 * goal-seek preview runs a draft and a refine pass concurrently on purpose.
 *
 * `compute` is the synchronous equivalent, used where Workers do not exist
 * (jsdom tests). Resolves null when superseded or when the request failed.
 */
const useWorkerChannel = <T>(
  extract: (response: MonteCarloResponse) => T | undefined,
  compute: (request: MonteCarloRequest) => T,
) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const send = useCallback(
    async (request: MonteCarloRequest): Promise<T | null> => {
      setError(null);
      setPending(true);

      if (!supportsWorker()) {
        try {
          return compute(request);
        } finally {
          if (mounted.current) setPending(false);
        }
      }

      workerRef.current?.terminate();
      const worker = new Worker(new URL('../workers/monteCarlo.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;

      return new Promise<T | null>((resolve) => {
        const finish = (value: T | null, message?: string) => {
          worker.terminate();
          // A newer request already claimed the channel: let it own the UI state.
          if (workerRef.current !== worker) return resolve(null);
          workerRef.current = null;
          if (mounted.current) {
            setPending(false);
            if (message) setError(message);
          }
          resolve(value);
        };

        worker.onmessage = (event: MessageEvent<MonteCarloResponse>) => {
          const data = event.data;
          if (!data.ok) return finish(null, data.error);
          const value = extract(data);
          if (value !== undefined) finish(value);
        };
        worker.onerror = (event) => finish(null, event.message || 'Simulation worker failed');

        worker.postMessage(request);
      });
    },
    [extract, compute],
  );

  return { pending, error, send };
};

const extractBalance = (r: MonteCarloResponse): BalanceResult | undefined =>
  r.ok && r.kind === 'balance' ? r.result : undefined;

const computeBalance = (req: MonteCarloRequest): BalanceResult => {
  if (req.kind !== 'balance') throw new Error('Expected a balance request');
  return balanceToTarget(
    req.input,
    req.options,
    req.target,
    req.locked,
    req.current,
    req.bounds,
    req.iterations,
  );
};

export interface UseGoalSeekBalance {
  readonly balancing: boolean;
  readonly error: string | null;
  /** Resolves with the solved lever mix, or null when the solve was superseded. */
  readonly solve: (args: BalanceArgs) => Promise<BalanceResult | null>;
}

/**
 * Run the goal-seek auto-balance off the main thread. The solve bisects over ~18
 * full Monte Carlo runs, which freezes the UI for seconds on a large plan if done
 * inline.
 */
export const useGoalSeekBalance = (): UseGoalSeekBalance => {
  const { pending, error, send } = useWorkerChannel(extractBalance, computeBalance);
  const solve = useCallback((args: BalanceArgs) => send({ kind: 'balance', ...args }), [send]);
  return { balancing: pending, error, solve };
};

const extractEval = (r: MonteCarloResponse): readonly number[] | undefined =>
  r.ok && r.kind === 'eval' ? r.result : undefined;

const computeEval = (req: MonteCarloRequest): readonly number[] => {
  if (req.kind !== 'eval') throw new Error('Expected an eval request');
  return req.levers.map((l) => evalSuccess(req.input, req.options, l, req.iterations));
};

export interface UseGoalSeekEval {
  readonly error: string | null;
  /** Success rates in the same order as `levers`, or null when superseded. */
  readonly evaluate: (args: EvalArgs) => Promise<readonly number[] | null>;
}

/**
 * Score lever mixes off the main thread. Each hook instance is its own channel:
 * the preview's draft and refine passes must not cancel one another, so they take
 * one each.
 */
export const useGoalSeekEval = (): UseGoalSeekEval => {
  const { error, send } = useWorkerChannel(extractEval, computeEval);
  const evaluate = useCallback((args: EvalArgs) => send({ kind: 'eval', ...args }), [send]);
  return { error, evaluate };
};
