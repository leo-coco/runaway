import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIER_CONFIG, resolveEntitlements } from '@/domain/entitlements';
import { fetchEntitlements } from './entitlementsApi';

describe('fetchEntitlements', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('omits session cookies when the sandbox requests the live free tier', async () => {
    const entitlements = resolveEntitlements(null, null, DEFAULT_TIER_CONFIG);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(entitlements),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchEntitlements(true);

    expect(fetchMock).toHaveBeenCalledWith('/api/entitlements', { credentials: 'omit' });
  });

  it('includes session cookies for the authenticated application', async () => {
    const entitlements = resolveEntitlements('premium', null, DEFAULT_TIER_CONFIG);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(entitlements),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchEntitlements();

    expect(fetchMock).toHaveBeenCalledWith('/api/entitlements', { credentials: 'include' });
  });
});
