const ACCOUNT_PLANS_KEY = 'runaway/plans';
// Bump this key whenever the standard Sandbox seed changes so stale local-only
// plans are replaced on the next visit without touching signed-in account data.
const SANDBOX_PLANS_KEY = 'runaway/sandbox-plans-v5';

export const isSandboxPathname = (pathname: string): boolean =>
  /^\/(?:en|fr)\/app\/sandbox(?:\/|$)/.test(pathname) || /^\/app\/sandbox(?:\/|$)/.test(pathname);

export const planStorageKeyForPathname = (pathname: string): string =>
  isSandboxPathname(pathname) ? SANDBOX_PLANS_KEY : ACCOUNT_PLANS_KEY;
