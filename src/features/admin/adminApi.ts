import type { TierConfig } from '@/domain/entitlements';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tier: string;
  premiumUntil: string | null;
  createdAt: string;
}

export interface UserPatch {
  tier?: 'free' | 'premium';
  role?: 'user' | 'admin';
  /** ISO datetime, or null to clear the expiry. */
  premiumUntil?: string | null;
}

const json = async (res: Response): Promise<unknown> => {
  if (!res.ok) {
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  }
  return res.json();
};

export const fetchAdminConfig = async (): Promise<TierConfig> =>
  json(await fetch('/api/admin/config', { credentials: 'include' })) as Promise<TierConfig>;

export const putAdminConfig = async (data: TierConfig): Promise<TierConfig> =>
  json(
    await fetch('/api/admin/config', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }),
  ) as Promise<TierConfig>;

export const fetchAdminUsers = async (): Promise<AdminUser[]> =>
  json(await fetch('/api/admin/users', { credentials: 'include' })) as Promise<AdminUser[]>;

export const patchAdminUser = async (id: string, patch: UserPatch): Promise<AdminUser> =>
  json(
    await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  ) as Promise<AdminUser>;
