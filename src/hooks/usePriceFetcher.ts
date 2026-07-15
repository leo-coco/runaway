import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/providers/ServicesContext';
import { queryKeys, STALE_TIME } from '@/providers/queryKeys';
import { useAppStore } from '@/store';
import { parseInstrumentId } from '@/services/instrumentRef';
import type { Holding } from '@/domain/asset';
import type { CurrencyCode } from '@/domain/money';
import type { AppError } from '@/domain/errors';

export type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface PriceFetchState {
  status: FetchStatus;
  error?: AppError;
}

/**
 * Fetches live prices for holdings (in their native currency) and writes them
 * back to the store. Crypto uses a 30s staleTime, equities 60s — via the shared
 * query cache so repeated clicks are deduplicated.
 */
export const usePriceFetcher = (planId: string) => {
  const services = useServices();
  const qc = useQueryClient();
  const updateHolding = useAppStore((s) => s.updateHolding);
  const [statuses, setStatuses] = useState<Record<string, PriceFetchState>>({});
  const [isFetchingAll, setIsFetchingAll] = useState(false);

  const fetchPrice = useCallback(
    async (holding: Holding): Promise<void> => {
      const ref = parseInstrumentId(holding.instrument.id);
      setStatuses((s) => ({ ...s, [holding.id]: { status: 'loading' } }));

      if (!ref) {
        setStatuses((s) => ({
          ...s,
          [holding.id]: {
            status: 'error',
            error: {
              kind: 'not_found',
              message: 'This asset has no linked data provider, so its price cannot be refreshed.',
            },
          },
        }));
        return;
      }

      const native = holding.instrument.nativeCurrency as CurrencyCode;
      try {
        const price =
          ref.provider === 'coingecko'
            ? await qc.fetchQuery({
                queryKey: queryKeys.cryptoPrice(ref.ref, native),
                staleTime: STALE_TIME.cryptoPrice,
                queryFn: async () => {
                  const r = await services.price.cryptoPrice(ref.ref, native);
                  if (!r.ok) throw r.error;
                  return r.value;
                },
              })
            : await qc.fetchQuery({
                queryKey: queryKeys.stockPrice(ref.ref),
                staleTime: STALE_TIME.stockPrice,
                queryFn: async () => {
                  const r = await services.price.stockPrice(ref.ref);
                  if (!r.ok) throw r.error;
                  return r.value;
                },
              });

        updateHolding(planId, holding.id, { pricePerUnit: price });
        setStatuses((s) => ({ ...s, [holding.id]: { status: 'success' } }));
      } catch (caught) {
        const error = caught as AppError;
        setStatuses((s) => ({ ...s, [holding.id]: { status: 'error', error } }));
      }
    },
    [planId, qc, services, updateHolding],
  );

  /**
   * Refreshes every holding, collapsing the equities into a single batch
   * request instead of one per holding. Crypto still goes per-holding: prices
   * are keyed by (coinId, currency) and holdings may differ in native currency.
   */
  const fetchAll = useCallback(
    async (holdings: readonly Holding[]): Promise<void> => {
      setIsFetchingAll(true);

      const stocks: { holding: Holding; symbol: string }[] = [];
      const rest: Holding[] = [];
      for (const h of holdings) {
        const ref = parseInstrumentId(h.instrument.id);
        if (ref && ref.provider !== 'coingecko') stocks.push({ holding: h, symbol: ref.ref });
        else rest.push(h);
      }

      const fetchStocks = async (): Promise<void> => {
        if (stocks.length === 0) return;
        const symbols = [...new Set(stocks.map((s) => s.symbol))];
        setStatuses((s) => ({
          ...s,
          ...Object.fromEntries(stocks.map(({ holding }) => [holding.id, { status: 'loading' }])),
        }));

        const res = await services.price.stockPrices(symbols);
        if (!res.ok) {
          setStatuses((s) => ({
            ...s,
            ...Object.fromEntries(
              stocks.map(({ holding }) => [holding.id, { status: 'error', error: res.error }]),
            ),
          }));
          return;
        }

        for (const { holding, symbol } of stocks) {
          const price = res.value[symbol.toUpperCase()];
          if (price === undefined) {
            setStatuses((s) => ({
              ...s,
              [holding.id]: {
                status: 'error',
                error: { kind: 'not_found', message: `No quote found for "${symbol}".` },
              },
            }));
            continue;
          }
          // Share the batch result with the per-row fetchPrice path, which
          // reads this same key.
          qc.setQueryData(queryKeys.stockPrice(symbol), price);
          updateHolding(planId, holding.id, { pricePerUnit: price });
          setStatuses((s) => ({ ...s, [holding.id]: { status: 'success' } }));
        }
      };

      await Promise.allSettled([fetchStocks(), ...rest.map((h) => fetchPrice(h))]);
      setIsFetchingAll(false);
    },
    [fetchPrice, planId, qc, services, updateHolding],
  );

  return { statuses, isFetchingAll, fetchPrice, fetchAll };
};
