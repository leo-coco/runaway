import type { Instrument } from '@/domain/asset';

/**
 * Instrument ids are namespaced `provider:ref`. These helpers decode them so the
 * price layer knows whether to call CoinGecko or the equities proxy. An unknown
 * namespace returns null, which strands the holding with "no linked data
 * provider" in usePriceFetcher.
 */
export type InstrumentProvider = 'coingecko' | 'equity';

export interface InstrumentRef {
  readonly provider: InstrumentProvider;
  readonly ref: string;
}

export const parseInstrumentId = (id: string): InstrumentRef | null => {
  const idx = id.indexOf(':');
  if (idx === -1) return null;
  const namespace = id.slice(0, idx);
  const ref = id.slice(idx + 1);
  if (ref.length === 0) return null;
  if (namespace !== 'coingecko' && namespace !== 'equity') return null;
  return { provider: namespace, ref };
};

export const instrumentRef = (instrument: Instrument): InstrumentRef | null =>
  parseInstrumentId(instrument.id);
