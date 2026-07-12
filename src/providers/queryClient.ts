import { QueryClient } from '@tanstack/react-query';

/** Shared query client. Per-query staleTime/gcTime are set at each call site. */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        gcTime: 5 * 60_000,
      },
    },
  });
