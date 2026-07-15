import { describe, expect, it } from 'vitest';
import { isSandboxPathname, planStorageKeyForPathname } from './planStorage';

describe('sandbox plan storage isolation', () => {
  it.each([
    '/fr/app/sandbox',
    '/en/app/sandbox/',
    '/fr/app/sandbox/plan/123/dashboard',
    '/app/sandbox/plan/legacy/dashboard',
  ])('uses dedicated sandbox storage for %s', (pathname) => {
    expect(isSandboxPathname(pathname)).toBe(true);
    expect(planStorageKeyForPathname(pathname)).toBe('runaway/sandbox-plans-v5');
  });

  it.each(['/fr/app', '/fr/app/plan/123/dashboard', '/en/app/signin', '/'])(
    'keeps account storage for %s',
    (pathname) => {
      expect(isSandboxPathname(pathname)).toBe(false);
      expect(planStorageKeyForPathname(pathname)).toBe('runaway/plans');
    },
  );
});
