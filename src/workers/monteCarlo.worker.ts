/// <reference lib="webworker" />
import {
  runMonteCarlo,
  type MonteCarloInput,
  type MonteCarloOptions,
  type MonteCarloResult,
} from '@/services/monteCarlo';

export interface MonteCarloRequest {
  readonly input: MonteCarloInput;
  readonly options: MonteCarloOptions;
}

export type MonteCarloResponse =
  | { readonly ok: true; readonly result: MonteCarloResult }
  | { readonly ok: false; readonly error: string };

self.addEventListener('message', (event: MessageEvent<MonteCarloRequest>) => {
  try {
    const result = runMonteCarlo(event.data.input, event.data.options);
    const response: MonteCarloResponse = { ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: MonteCarloResponse = {
      ok: false,
      error: err instanceof Error ? err.message : 'Monte Carlo simulation failed',
    };
    self.postMessage(response);
  }
});
