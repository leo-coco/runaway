import { useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query and re-render when it changes. Uses
 * useSyncExternalStore so the first paint already reflects the real match
 * (no flash of the wrong layout). SSR-safe: the server snapshot is `false`.
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  };
  const getSnapshot = () =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
};

/** True below the shell breakpoint, where the sidebar becomes an off-canvas drawer. */
export const useIsMobileShell = (): boolean => useMediaQuery('(max-width: 820px)');
