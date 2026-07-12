import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useServices } from '@/providers/ServicesContext';
import { queryKeys, STALE_TIME } from '@/providers/queryKeys';
import type { CurrencyCode } from '@/domain/money';
import type { AppError } from '@/domain/errors';
import type { RatesTable } from '@/services/currencyService';

/** Live FX table for a base currency (staleTime: 5min). */
export const useExchangeRate = (base: CurrencyCode): UseQueryResult<RatesTable, AppError> => {
  const { price } = useServices();
  return useQuery<RatesTable, AppError>({
    queryKey: queryKeys.fx(base),
    staleTime: STALE_TIME.fx,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const result = await price.rates(base);
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
};
