import { describe, expect, it } from 'vitest';
import { parseInstrumentId } from './instrumentRef';

describe('parseInstrumentId', () => {
  it('parses the equity namespace', () => {
    expect(parseInstrumentId('equity:VOO')).toEqual({ provider: 'equity', ref: 'VOO' });
  });

  it('parses the coingecko namespace', () => {
    expect(parseInstrumentId('coingecko:bitcoin')).toEqual({
      provider: 'coingecko',
      ref: 'bitcoin',
    });
  });

  it('normalizes the legacy alphavantage alias to equity so saved plans keep resolving', () => {
    expect(parseInstrumentId('alphavantage:VOO')).toEqual({ provider: 'equity', ref: 'VOO' });
  });

  it('keeps colons in the ref intact', () => {
    expect(parseInstrumentId('equity:BRK:B')).toEqual({ provider: 'equity', ref: 'BRK:B' });
  });

  it('returns null for an unknown namespace', () => {
    expect(parseInstrumentId('yahoo:VOO')).toBeNull();
  });

  it('returns null when there is no namespace separator', () => {
    expect(parseInstrumentId('VOO')).toBeNull();
  });

  it('returns null for an empty ref', () => {
    expect(parseInstrumentId('equity:')).toBeNull();
  });
});
