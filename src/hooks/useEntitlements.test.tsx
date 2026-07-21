import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIER_CONFIG, resolveEntitlements } from '@/domain/entitlements';
import { loadEntitlements, useEntitlements, useEntitlementsReady } from './useEntitlements';

const fetchEntitlements = vi.hoisted(() => vi.fn());

vi.mock('@/lib/authClient', () => ({ useSession: () => ({ data: null }) }));
vi.mock('@/providers/AppModeContext', () => ({ useAppMode: () => ({ sandbox: true }) }));
vi.mock('@/features/billing/entitlementsApi', () => ({
  fetchEntitlements: (asGuest: boolean) => fetchEntitlements(asGuest),
}));

describe('useEntitlements in sandbox', () => {
  beforeEach(() => fetchEntitlements.mockReset());

  it('replaces the local fallback with the live guest tier limits', async () => {
    const liveConfig = {
      ...DEFAULT_TIER_CONFIG,
      free: {
        ...DEFAULT_TIER_CONFIG.free,
        limits: { ...DEFAULT_TIER_CONFIG.free.limits, maxAccounts: 5 },
      },
    };
    fetchEntitlements.mockResolvedValue(resolveEntitlements(null, null, liveConfig));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => ({ entitlements: useEntitlements(), ready: useEntitlementsReady() }),
      { wrapper },
    );

    expect(result.current.entitlements.limits.maxAccounts).toBe(
      DEFAULT_TIER_CONFIG.free.limits.maxAccounts,
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.entitlements.limits.maxAccounts).toBe(5);
    expect(fetchEntitlements).toHaveBeenCalledWith(true);
  });

  it('reports ready once the request fails, instead of blocking callers forever', async () => {
    fetchEntitlements.mockImplementation(() => Promise.reject(new Error('API 500')));
    await expect(loadEntitlements(true)).resolves.toEqual(
      resolveEntitlements(null, null, DEFAULT_TIER_CONFIG),
    );
    fetchEntitlements.mockResolvedValue(resolveEntitlements(null, null, DEFAULT_TIER_CONFIG));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => ({ entitlements: useEntitlements(), ready: useEntitlementsReady() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.entitlements.limits.maxAccounts).toBe(
      DEFAULT_TIER_CONFIG.free.limits.maxAccounts,
    );
  });
});
