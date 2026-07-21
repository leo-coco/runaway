import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppStore, useStoreHydrated } from './index';

describe('useStoreHydrated', () => {
  afterEach(() => vi.restoreAllMocks());

  it('observes hydration that finishes before the effect subscribes', async () => {
    let hydrated = false;
    const hasHydrated = vi
      .spyOn(useAppStore.persist, 'hasHydrated')
      .mockImplementation(() => hydrated);
    const onHydrate = vi.spyOn(useAppStore.persist, 'onHydrate').mockReturnValue(() => undefined);
    const onFinishHydration = vi
      .spyOn(useAppStore.persist, 'onFinishHydration')
      .mockImplementation(() => {
        // Finish in the narrow window after the first snapshot read but before
        // the subscription is fully installed, without delivering an event.
        hydrated = true;
        return () => undefined;
      });

    const { result } = renderHook(() => useStoreHydrated());

    await waitFor(() => expect(result.current).toBe(true));
    expect(onHydrate).toHaveBeenCalledOnce();
    expect(onFinishHydration).toHaveBeenCalledOnce();
    expect(hasHydrated).toHaveBeenCalled();
  });
});
