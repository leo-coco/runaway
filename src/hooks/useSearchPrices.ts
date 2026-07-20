import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/providers/ServicesContext';
import { STALE_TIME } from '@/providers/queryKeys';
import { parseInstrumentId } from '@/services/instrumentRef';
import type { Instrument } from '@/domain/asset';
import type { CurrencyCode } from '@/domain/money';

export type PriceStatus = 'loading' | 'success' | 'error';

export interface LivePrice {
  readonly status: PriceStatus;
  readonly value?: number;
  readonly currency: CurrencyCode;
}

/**
 * Fetch live prices for a list of search-result instruments. Crypto prices are
 * batched into one CoinGecko request; equity prices into one batched market
 * request (the proxy caches per ticker, so a keystroke only fetches symbols not
 * already cached). Each price is returned in the instrument's own native
 * currency. Returns a lookup by instrument id.
 */
export const useSearchPrices = (instruments: readonly Instrument[]): Map<string, LivePrice> => {
  const services = useServices();

  const { cryptoInstruments, coinIds, equityInstruments, equitySymbols } = useMemo(() => {
    const crypto: Instrument[] = [];
    const equity: Instrument[] = [];
    for (const inst of instruments) {
      const ref = parseInstrumentId(inst.id);
      if (ref?.provider === 'coingecko') crypto.push(inst);
      else if (ref?.provider === 'equity') equity.push(inst);
    }
    return {
      cryptoInstruments: crypto,
      coinIds: crypto.map((i) => parseInstrumentId(i.id)?.ref ?? ''),
      equityInstruments: equity,
      equitySymbols: equity.map((i) => parseInstrumentId(i.id)?.ref ?? ''),
    };
  }, [instruments]);

  const cryptoQuery = useQuery<Record<string, number>>({
    queryKey: ['searchPrices', 'crypto', [...coinIds].sort().join(',')],
    enabled: coinIds.length > 0,
    staleTime: STALE_TIME.cryptoPrice,
    queryFn: async () => {
      const r = await services.price.cryptoPrices(coinIds, 'USD');
      if (!r.ok) throw r.error;
      return r.value;
    },
  });

  const equityQuery = useQuery<Record<string, number>>({
    queryKey: ['searchPrices', 'equity', [...equitySymbols].sort().join(',')],
    enabled: equitySymbols.length > 0,
    staleTime: STALE_TIME.stockPrice,
    queryFn: async () => {
      const r = await services.price.stockPrices(equitySymbols);
      if (!r.ok) throw r.error;
      return r.value;
    },
  });

  return useMemo(() => {
    const lookup = new Map<string, LivePrice>();

    for (const inst of cryptoInstruments) {
      const coinId = parseInstrumentId(inst.id)?.ref ?? '';
      const value = cryptoQuery.data?.[coinId];
      lookup.set(inst.id, {
        status: cryptoQuery.isLoading ? 'loading' : value !== undefined ? 'success' : 'error',
        value,
        currency: inst.nativeCurrency,
      });
    }

    for (const inst of equityInstruments) {
      const symbol = (parseInstrumentId(inst.id)?.ref ?? '').toUpperCase();
      const value = equityQuery.data?.[symbol];
      lookup.set(inst.id, {
        status: equityQuery.isLoading ? 'loading' : value !== undefined ? 'success' : 'error',
        value,
        currency: inst.nativeCurrency,
      });
    }

    return lookup;
  }, [
    cryptoInstruments,
    cryptoQuery.data,
    cryptoQuery.isLoading,
    equityInstruments,
    equityQuery.data,
    equityQuery.isLoading,
  ]);
};
