import type { Entitlements } from '@/domain/entitlements';

/** Fetch the caller's effective entitlements (guests get the live free-tier config). */
export const fetchEntitlements = async (asGuest = false): Promise<Entitlements> => {
  const res = await fetch('/api/entitlements', {
    credentials: asGuest ? 'omit' : 'include',
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<Entitlements>;
};
