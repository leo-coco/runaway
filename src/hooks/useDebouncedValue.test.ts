import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('useDebouncedValue', () => {
  it('returns the initial value before any delay elapses', () => {
    const { result } = renderHook(() => useDebouncedValue('bit'));

    expect(result.current).toBe('bit');
  });

  it('holds the previous value until the delay elapses', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), {
      initialProps: { v: 'bit' },
    });

    rerender({ v: 'bitcoin' });
    expect(result.current).toBe('bit');

    advance(299);
    expect(result.current).toBe('bit');

    advance(1);
    expect(result.current).toBe('bitcoin');
  });

  it('emits only the last value when it changes faster than the delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), {
      initialProps: { v: 'b' },
    });

    for (const v of ['bi', 'bit', 'bitc', 'bitco']) {
      rerender({ v });
      advance(100);
    }
    expect(result.current).toBe('b');

    advance(300);
    expect(result.current).toBe('bitco');
  });

  it('honours a custom delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 50), {
      initialProps: { v: 'a' },
    });

    rerender({ v: 'b' });
    advance(50);

    expect(result.current).toBe('b');
  });

  it('cancels a pending update when the value reverts before the delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), {
      initialProps: { v: 'a' },
    });

    rerender({ v: 'b' });
    advance(100);
    rerender({ v: 'a' });
    advance(300);

    expect(result.current).toBe('a');
  });

  it('drops a pending update when the hook unmounts', () => {
    const { result, rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v), {
      initialProps: { v: 'a' },
    });

    rerender({ v: 'b' });
    unmount();
    advance(300);

    expect(result.current).toBe('a');
  });

  it('works for non-string values', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), {
      initialProps: { v: { count: 1 } },
    });

    rerender({ v: { count: 2 } });
    advance(300);

    expect(result.current).toEqual({ count: 2 });
  });
});
