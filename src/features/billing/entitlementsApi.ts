import type { Entitlements } from '@/domain/entitlements';

/** Fetch the caller's effective entitlements (guests get free defaults). */
export const fetchEntitlements = async (): Promise<Entitlements> => {
  const res = await fetch('/api/entitlements', { credentials: 'include' });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<Entitlements>;
};
