/* Temporary audit checks — delete after the audit. */
import { describe, it } from 'vitest';
import { runMonteCarlo, type MonteCarloInput, type MonteCarloOptions } from '@/services/monteCarlo';
import { applyForcedFlows } from '@/domain/taxAdvantaged';
import { incomeTax } from '@/domain/tax';

const mkInput = (sigmaPct: number, driftPct: number): MonteCarloInput => ({
  assets: [
    {
      startValue: 100_000,
      driftPct,
      sigmaPct,
      annualContribution: 0,
      accountId: null,
      symbol: 'X',
      assetClass: 'crypto',
    },
  ],
  correlation: [[1]],
  accounts: [],
  accountOrder: [],
  annualSpending: 0,
  inflationPct: 0,
  startYear: 2026,
  retirementYear: 2100,
  horizonYears: 20,
});

const opts: MonteCarloOptions = {
  iterations: 20_000,
  seed: 12345,
  retirementHorizon: 1,
  model: 'bootstrap',
  meanReversion: 0.15,
};

describe('audit checks', () => {
  it('check 1: median compound rate vs stated CAGR under return caps', () => {
    for (const [sigma, drift] of [
      [16, 7],
      [40, 15],
      [70, 20],
      [110, 25],
    ] as const) {
      const r = runMonteCarlo(mkInput(sigma, drift), opts);
      const last = r.percentiles[r.percentiles.length - 1]!;
      const medianCagr = (Math.pow(last.p50 / 100_000, 1 / 20) - 1) * 100;
      console.log(
        `sigma=${sigma}% stated CAGR=${drift}% -> median compound 20y = ${medianCagr.toFixed(2)}%`,
      );
    }
  });

  it('check 2: conversion to an account with no holdings', () => {
    const assets = [{ value: 500_000, accountId: 'ira', basis: 0 }];
    const res = applyForcedFlows(assets, (id) => (id === 'ira' ? 'tax_deferred' : 'tax_free'), {
      residence: 'US',
      age: 65,
      birthYear: 1961,
      rmdEnabled: false,
      conversions: [
        {
          id: 'c1',
          fromAccountId: 'ira',
          toAccountId: 'roth-empty',
          annualAmount: 50_000,
          startAge: 60,
          endAge: 70,
        },
      ],
      inflationFactor: 1,
    });
    const totalAfter = assets.reduce((s, a) => s + a.value, 0);
    console.log(
      `conversionIncome=${res.conversionIncome}, portfolio total after=${totalAfter} (was 500000)`,
    );
  });

  it('check 3: taxes with no standard deduction / personal amounts', () => {
    console.log('US tax on $60,000:', incomeTax(60_000, 'US').toFixed(0));
    console.log('CA-ON tax on $60,000:', incomeTax(60_000, 'CA', 1, 'ON').toFixed(0));
    console.log('FR tax on 60,000 EUR:', incomeTax(60_000, 'FR').toFixed(0));
  });
});
