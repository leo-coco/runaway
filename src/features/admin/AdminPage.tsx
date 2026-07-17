import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { TierConfig, TierFeatures } from '@/domain/entitlements';
import {
  fetchAdminConfig,
  putAdminConfig,
  fetchAdminUsers,
  patchAdminUser,
  type AdminUser,
} from './adminApi';

const FEATURE_KEYS: (keyof TierFeatures)[] = [
  'monteCarlo',
  'withdrawalOrdering',
  'accountsTax',
  'phasedSpending',
  'realEstate',
];

/** Parse a limit input: blank means unlimited (null). */
const parseLimit = (v: string): number | null => {
  const trimmed = v.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

const limitValue = (n: number | null): string => (n === null ? '' : String(n));

const TierConfigEditor = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'config'],
    queryFn: fetchAdminConfig,
  });
  // Seed the editable draft from the fetched config, and re-seed if a fresh copy
  // arrives (e.g. after a save). Adjust-during-render pattern (no setState-in-effect).
  const [draft, setDraft] = useState<TierConfig | null>(null);
  const [seededFrom, setSeededFrom] = useState<TierConfig | undefined>(undefined);
  if (data && data !== seededFrom) {
    setSeededFrom(data);
    setDraft(data);
  }

  const save = useMutation({
    mutationFn: (cfg: TierConfig) => putAdminConfig(cfg),
    onSuccess: (saved) => {
      qc.setQueryData(['admin', 'config'], saved);
      // Every user's resolved entitlements may have changed.
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
  });

  if (isLoading) return <Card padded>{t('common.loading')}</Card>;
  if (error || !draft) return <Card padded>{t('admin.forbidden')}</Card>;

  const setFreeLimit = (key: 'maxPlans' | 'maxAssets' | 'maxAccounts', v: string) =>
    setDraft({
      ...draft,
      free: { ...draft.free, limits: { ...draft.free.limits, [key]: parseLimit(v) } },
    });

  const toggleFreeFeature = (key: keyof TierFeatures, on: boolean) =>
    setDraft({
      ...draft,
      free: { ...draft.free, features: { ...draft.free.features, [key]: on } },
    });

  return (
    <Card padded className="admin-card">
      <h2 className="section__title">{t('admin.tierConfig')}</h2>

      <h3 className="admin-sub">{t('admin.freeLimits')}</h3>
      <div className="admin-grid">
        {(['maxPlans', 'maxAssets', 'maxAccounts'] as const).map((key) => (
          <div className="field" key={key}>
            <label className="field__label" htmlFor={`lim-${key}`}>
              {t(`admin.limit.${key}`)}
            </label>
            <input
              id={`lim-${key}`}
              className="search-input"
              type="number"
              min={0}
              placeholder={t('admin.unlimited')}
              value={limitValue(draft.free.limits[key])}
              onChange={(e) => setFreeLimit(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <h3 className="admin-sub">{t('admin.freeFeatures')}</h3>
      <div className="admin-checks">
        {FEATURE_KEYS.map((key) => (
          <label className="admin-check" key={key}>
            <input
              type="checkbox"
              checked={draft.free.features[key]}
              onChange={(e) => toggleFreeFeature(key, e.target.checked)}
            />
            {t(`admin.feature.${key}`)}
          </label>
        ))}
      </div>

      <div className="admin-actions">
        <Button variant="primary" onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {save.isPending ? t('common.loading') : t('common.saveChanges')}
        </Button>
        {save.isError && <span className="field-error">{t('admin.saveFailed')}</span>}
        {save.isSuccess && <span className="admin-ok">{t('admin.saved')}</span>}
      </div>
    </Card>
  );
};

const UserRow = ({ user }: { user: AdminUser }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tier, setTier] = useState<'free' | 'premium'>(
    user.tier === 'premium' ? 'premium' : 'free',
  );
  const [until, setUntil] = useState(user.premiumUntil ? user.premiumUntil.slice(0, 10) : '');

  const save = useMutation({
    mutationFn: () =>
      patchAdminUser(user.id, {
        tier,
        premiumUntil: until ? new Date(until).toISOString() : null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
  });

  return (
    <tr>
      <td>{user.email}</td>
      <td>{user.role}</td>
      <td>
        <select
          className="select"
          value={tier}
          onChange={(e) => setTier(e.target.value as 'free' | 'premium')}
        >
          <option value="free">{t('admin.tierFree')}</option>
          <option value="premium">{t('admin.tierPremium')}</option>
        </select>
      </td>
      <td>
        <input
          className="search-input"
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
      </td>
      <td>
        <Button size="sm" variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </td>
    </tr>
  );
};

const UsersTable = () => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchAdminUsers,
  });
  if (isLoading) return <Card padded>{t('common.loading')}</Card>;
  if (error) return <Card padded>{t('admin.forbidden')}</Card>;

  return (
    <Card padded className="admin-card">
      <h2 className="section__title">{t('admin.users')}</h2>
      <div className="admin-table-wrap">
        <table className="runway-table">
          <thead>
            <tr>
              <th>{t('admin.colEmail')}</th>
              <th>{t('admin.colRole')}</th>
              <th>{t('admin.colTier')}</th>
              <th>{t('admin.colPremiumUntil')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

/**
 * Admin console: edit the tier config (limits/features/pricing) and grant Premium
 * manually. Authorization is enforced server-side; a non-admin simply sees the
 * forbidden state because the admin API returns 403.
 */
export const AdminPage = () => {
  const { t } = useTranslation();
  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{t('admin.title')}</h1>
          <p className="page-head__desc">{t('admin.subtitle')}</p>
        </div>
      </div>
      <div className="admin-stack">
        <TierConfigEditor />
        <UsersTable />
      </div>
    </div>
  );
};
