import { describe, expect, it } from 'vitest';
import { matchPseudoAssets } from './pseudoAssets';

describe('matchPseudoAssets', () => {
  it('matches cash in English and French', () => {
    expect(matchPseudoAssets('cash').map((s) => s.id)).toEqual(['local:cash']);
    expect(matchPseudoAssets('argent').map((s) => s.id)).toEqual(['local:cash']);
  });

  it('no longer matches house/real estate', () => {
    expect(matchPseudoAssets('house')).toEqual([]);
    expect(matchPseudoAssets('maison')).toEqual([]);
  });

  it('matches GIC in English and French, accent-insensitive', () => {
    expect(matchPseudoAssets('gic').map((s) => s.id)).toEqual(['local:gic']);
    expect(matchPseudoAssets('GIC').map((s) => s.id)).toEqual(['local:gic']);
    expect(matchPseudoAssets('cpg').map((s) => s.id)).toEqual(['local:gic']);
  });

  it('does not match unrelated tickers', () => {
    expect(matchPseudoAssets('nvda')).toEqual([]);
    expect(matchPseudoAssets('bitcoin')).toEqual([]);
  });

  it('requires at least 2 characters', () => {
    expect(matchPseudoAssets('c')).toEqual([]);
    expect(matchPseudoAssets(' ')).toEqual([]);
  });
});
