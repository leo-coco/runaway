/// <reference lib="webworker" />
import {
  runMonteCarlo,
  type MonteCarloInput,
  type MonteCarloOptions,
  type MonteCarloResult,
} from '@/services/monteCarlo';
import {
  balanceToTarget,
  evalSuccess,
  type ActiveLeverKey,
  type BalanceResult,
  type LeverBounds,
  type Levers,
} from '@/services/goalSeek';

/** A single simulation. */
export interface MonteCarloRunRequest {
  readonly kind: 'run';
  readonly input: MonteCarloInput;
  readonly options: MonteCarloOptions;
}

/**
 * The goal-seek auto-balance solve. Sent as ONE request rather than a run per
 * bisection step: the solve is ~18 full simulations, and round-tripping each
 * step would only move the latency around instead of off the caller.
 */
export interface MonteCarloBalanceRequest {
  readonly kind: 'balance';
  readonly input: MonteCarloInput;
  readonly options: MonteCarloOptions;
  readonly target: number;
  readonly locked: Record<ActiveLeverKey, boolean>;
  readonly current: Levers;
  readonly bounds: LeverBounds;
  readonly iterations: number;
}

/**
 * Success rates for several lever mixes at once. Batched because the goal-seek
 * preview always wants a handful together (the mix plus each changed lever on
 * its own), and one message beats N round-trips.
 */
export interface MonteCarloEvalRequest {
  readonly kind: 'eval';
  readonly input: MonteCarloInput;
  readonly options: MonteCarloOptions;
  readonly levers: readonly Levers[];
  readonly iterations: number;
}

export type MonteCarloRequest =
  | MonteCarloRunRequest
  | MonteCarloBalanceRequest
  | MonteCarloEvalRequest;

export type MonteCarloResponse =
  | { readonly ok: true; readonly kind: 'run'; readonly result: MonteCarloResult }
  | { readonly ok: true; readonly kind: 'balance'; readonly result: BalanceResult }
  | { readonly ok: true; readonly kind: 'eval'; readonly result: readonly number[] }
  | { readonly ok: false; readonly error: string };

const handle = (req: MonteCarloRequest): MonteCarloResponse => {
  if (req.kind === 'eval') {
    return {
      ok: true,
      kind: 'eval',
      result: req.levers.map((l) => evalSuccess(req.input, req.options, l, req.iterations)),
    };
  }
  if (req.kind === 'balance') {
    return {
      ok: true,
      kind: 'balance',
      result: balanceToTarget(
        req.input,
        req.options,
        req.target,
        req.locked,
        req.current,
        req.bounds,
        req.iterations,
      ),
    };
  }
  return { ok: true, kind: 'run', result: runMonteCarlo(req.input, req.options) };
};

self.addEventListener('message', (event: MessageEvent<MonteCarloRequest>) => {
  try {
    self.postMessage(handle(event.data));
  } catch (err) {
    const response: MonteCarloResponse = {
      ok: false,
      error: err instanceof Error ? err.message : 'Monte Carlo simulation failed',
    };
    self.postMessage(response);
  }
});
