import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useServices } from '@/providers/ServicesContext';
import { queryKeys, STALE_TIME } from '@/providers/queryKeys';
import type { Instrument } from '@/domain/asset';
import type { AppError } from '@/domain/errors';

/** Debounced instrument search (crypto + equities). Enabled at >= 2 chars. */
export const useAssetSearch = (query: string): UseQueryResult<readonly Instrument[], AppError> => {
  const { search } = useServices();
  return useQuery<readonly Instrument[], AppError>({
    queryKey: queryKeys.search(query),
    enabled: query.trim().length >= 2,
    staleTime: STALE_TIME.search,
    queryFn: async ({ signal }) => {
      const result = await search.search(query, signal);
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
};
