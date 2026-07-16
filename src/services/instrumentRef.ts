import type { Instrument } from '@/domain/asset';

/**
 * Instrument ids are namespaced `provider:ref`. These helpers decode them so the
 * price layer knows whether to call CoinGecko or the equities proxy.
 *
 * Two providers exist: `coingecko` and `equity`. `alphavantage` is a legacy
 * alias for `equity` — it predates the move off Alpha Vantage and is baked into
 * every plan saved before the rename (encrypted at rest, so not rewritable
 * server-side). parseInstrumentId normalizes it to `equity` so those holdings
 * keep resolving forever; an unknown namespace returns null, which strands the
 * holding with "no linked data provider" in usePriceFetcher.
 */
export type InstrumentProvider = 'coingecko' | 'equity';

/** Legacy namespace kept parseable forever; normalized to `equity`. */
const LEGACY_EQUITY_NAMESPACE = 'alphavantage';

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
  const provider: InstrumentProvider | null =
    namespace === 'coingecko'
      ? 'coingecko'
      : namespace === 'equity' || namespace === LEGACY_EQUITY_NAMESPACE
        ? 'equity'
        : null;
  if (provider === null) return null;
  return { provider, ref };
};

export const instrumentRef = (instrument: Instrument): InstrumentRef | null =>
  parseInstrumentId(instrument.id);
