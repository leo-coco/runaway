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

  const fetchAll = useCallback(
    async (holdings: readonly Holding[]): Promise<void> => {
      setIsFetchingAll(true);
      await Promise.allSettled(holdings.map((h) => fetchPrice(h)));
      setIsFetchingAll(false);
    },
    [fetchPrice],
  );

  return { statuses, isFetchingAll, fetchPrice, fetchAll };
};
