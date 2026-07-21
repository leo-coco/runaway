import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { ServicesProvider } from '@/providers/ServicesContext';
import { createServices } from '@/services/container';

/**
 * Renders a hook against the real service container, so a test exercises the
 * whole client stack — hook → service → infrastructure client → Zod schema —
 * with only the HTTP boundary faked by msw. Nothing in between is mocked.
 */
export const COINGECKO_BASE = 'https://coingecko.test/api/v3';
export const MARKET_BASE = '/api/market/equities';

export const renderHookWithServices = <T,>(hook: () => T) => {
  // retry: false so a provider error surfaces on the first response instead of
  // stalling the test behind react-query's backoff.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const services = createServices({ coinGeckoBaseUrl: COINGECKO_BASE });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ServicesProvider services={services}>{children}</ServicesProvider>
    </QueryClientProvider>
  );

  return { ...renderHook(hook, { wrapper }), queryClient };
};
