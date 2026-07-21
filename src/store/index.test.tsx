import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppStore, useStoreHydrated } from './index';

describe('useStoreHydrated', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    await act(async () => {
      await useAppStore.persist.rehydrate();
    });
  });

  it('finishes hydration when the storage key does not exist', async () => {
    localStorage.clear();
    const { result } = renderHook(() => useStoreHydrated());

    await act(async () => {
      await useAppStore.persist.rehydrate();
    });

    expect(useAppStore.persist.hasHydrated()).toBe(true);
    expect(result.current).toBe(true);
  });

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

  it('settles after a storage error instead of blocking the app forever', async () => {
    const storageError = new Error('stored plan is invalid');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw storageError;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useStoreHydrated());

    await act(async () => {
      await useAppStore.persist.rehydrate();
    });

    expect(useAppStore.persist.hasHydrated()).toBe(false);
    expect(result.current).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      '[store] localStorage hydration failed; continuing with in-memory state.',
      storageError,
    );
  });
});
