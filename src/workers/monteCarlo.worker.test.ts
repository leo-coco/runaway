import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MC_OPTIONS, type MonteCarloInput } from '@/services/monteCarlo';
import { neutralLevers, type ActiveLeverKey, type LeverBounds } from '@/services/goalSeek';
import type { MonteCarloRequest, MonteCarloResponse } from './monteCarlo.worker';

/**
 * Exercises the worker's message protocol. In jsdom `self` is the window, so
 * `postMessage` is stubbed before the module is imported — the real one would
 * re-dispatch a 'message' event straight back into the listener under test.
 */
const posted: MonteCarloResponse[] = [];

beforeAll(async () => {
  vi.spyOn(globalThis, 'postMessage').mockImplementation(((message: MonteCarloResponse) => {
    posted.push(message);
  }) as typeof globalThis.postMessage);
  await import('./monteCarlo.worker');
});

beforeEach(() => {
  posted.length = 0;
});

/** Drives one request through the worker's listener and returns its response. */
const send = (request: MonteCarloRequest): MonteCarloResponse => {
  globalThis.dispatchEvent(new MessageEvent('message', { data: request }));
  expect(posted).toHaveLength(1);
  return posted[0]!;
};

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

// Small run counts: this asserts the protocol, not simulation accuracy (covered
// in src/services/monteCarlo.test.ts).
const options = { ...DEFAULT_MC_OPTIONS, seed: 7, runs: 40, retirementHorizon: 25 };
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

describe('monteCarlo worker protocol', () => {
  it('answers a run request with a simulation result', () => {
    const response = send({ kind: 'run', input: input(), options });

    expect(response.ok).toBe(true);
    if (response.ok && response.kind === 'run') {
      expect(response.result.successRate).toBeGreaterThanOrEqual(0);
      expect(response.result.successRate).toBeLessThanOrEqual(1);
    } else {
      expect.unreachable('expected a run response');
    }
  });

  it('answers an eval request with one success rate per lever mix', () => {
    const levers = [neutralLevers(40_000), { ...neutralLevers(40_000), extraCapital: 250_000 }];

    const response = send({ kind: 'eval', input: input(), options, levers, iterations: 40 });

    expect(response.ok).toBe(true);
    if (response.ok && response.kind === 'eval') {
      expect(response.result).toHaveLength(2);
      for (const rate of response.result) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
    } else {
      expect.unreachable('expected an eval response');
    }
  });

  it('answers a balance request with a solved lever mix', () => {
    const response = send({
      kind: 'balance',
      input: input(),
      options,
      target: 0.9,
      locked: unlocked,
      current: neutralLevers(40_000),
      bounds,
      iterations: 40,
    });

    expect(response.ok).toBe(true);
    if (response.ok && response.kind === 'balance') {
      expect(response.result).toMatchObject({
        levers: expect.any(Object),
        success: expect.any(Number),
        reached: expect.any(Boolean),
      });
    } else {
      expect.unreachable('expected a balance response');
    }
  });

  it('echoes the request kind back so a caller can tell responses apart', () => {
    const run = send({ kind: 'run', input: input(), options });
    posted.length = 0;
    const evaluated = send({
      kind: 'eval',
      input: input(),
      options,
      levers: [neutralLevers(40_000)],
      iterations: 40,
    });

    expect(run.ok && run.kind).toBe('run');
    expect(evaluated.ok && evaluated.kind).toBe('eval');
  });

  it('reports a failure as an error response instead of throwing out of the worker', () => {
    const broken = { kind: 'run', input: null, options } as unknown as MonteCarloRequest;

    const response = send(broken);

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error).toBeTruthy();
  });

  it('keeps serving requests after one has failed', () => {
    send({ kind: 'run', input: null, options } as unknown as MonteCarloRequest);
    posted.length = 0;

    const response = send({ kind: 'run', input: input(), options });

    expect(response.ok).toBe(true);
  });
});
