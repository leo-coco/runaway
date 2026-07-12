import type { Instrument } from '@/domain/asset';

/**
 * Instrument ids are namespaced `provider:ref`. These helpers decode them so the
 * price layer knows whether to call CoinGecko or Alpha Vantage.
 */
export type InstrumentProvider = 'coingecko' | 'alphavantage';

export interface InstrumentRef {
  readonly provider: InstrumentProvider;
  readonly ref: string;
}

export const parseInstrumentId = (id: string): InstrumentRef | null => {
  const idx = id.indexOf(':');
  if (idx === -1) return null;
  const provider = id.slice(0, idx);
  const ref = id.slice(idx + 1);
  if (provider !== 'coingecko' && provider !== 'alphavantage') return null;
  if (ref.length === 0) return null;
  return { provider, ref };
};

export const instrumentRef = (instrument: Instrument): InstrumentRef | null =>
  parseInstrumentId(instrument.id);
