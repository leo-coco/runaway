import type { Instrument } from '@/domain/asset';

/**
 * Instrument ids are namespaced `provider:ref`. These helpers decode them so the
 * price layer knows whether to call CoinGecko or the equities proxy.
 *
 * `alphavantage` predates the move off Alpha Vantage and now just means
 * "equity". It is baked into every saved plan (encrypted at rest, so not
 * rewritable server-side) and must keep parsing forever: an unknown provider
 * makes parseInstrumentId return null, which strands the holding with
 * "no linked data provider" in usePriceFetcher.
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
