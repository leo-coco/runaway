import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobileShell, useMediaQuery } from './useMediaQuery';

/**
 * jsdom has no matchMedia. Install one whose match state can be flipped, and
 * that records listener add/remove so unsubscribe is observable.
 */
const installMatchMedia = (initialMatches: boolean) => {
  const listeners = new Set<() => void>();
  let matches = initialMatches;
  const queries: string[] = [];

  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => void listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => void listeners.delete(cb),
    };
  });

  return {
    queries,
    listenerCount: () => listeners.size,
    set: (next: boolean) =>
      act(() => {
        matches = next;
        for (const cb of listeners) cb();
      }),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('reflects the real match on the first render, with no flash of the wrong value', () => {
    installMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery('(max-width: 820px)'));

    expect(result.current).toBe(true);
  });

  it('re-renders when the query starts matching', () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 820px)'));
    expect(result.current).toBe(false);

    mql.set(true);

    expect(result.current).toBe(true);
  });

  it('re-renders when the query stops matching', () => {
    const mql = installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 820px)'));

    mql.set(false);

    expect(result.current).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const mql = installMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 820px)'));
    expect(mql.listenerCount()).toBe(1);

    unmount();

    expect(mql.listenerCount()).toBe(0);
  });

  it('falls back to false when the environment has no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);

    const { result } = renderHook(() => useMediaQuery('(max-width: 820px)'));

    expect(result.current).toBe(false);
  });

  it('useIsMobileShell subscribes to the shell breakpoint', () => {
    const mql = installMatchMedia(true);

    const { result } = renderHook(() => useIsMobileShell());

    expect(result.current).toBe(true);
    expect(mql.queries).toContain('(max-width: 820px)');
  });
});
