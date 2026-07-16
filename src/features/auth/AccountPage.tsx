import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { AlertIcon, TrashIcon } from '@/components/icons';
import { authClient, useSession } from '@/lib/authClient';
import { BillingCard } from '@/features/billing/BillingCard';
import { useAppStore } from '@/store';
import { asCountry, COUNTRIES, COUNTRY_FLAG, COUNTRY_LABEL, type Country } from '@/domain/country';

const validResidence = (value: string | undefined): Country => asCountry(value) ?? 'US';

/** Account identity, tax residence and irreversible account-deletion controls. */
export const AccountPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: sessionData } = useSession();
  const user = sessionData?.user;
  const setAllResidenceCountries = useAppStore((s) => s.setAllResidenceCountries);
  const hydratePlans = useAppStore((s) => s.hydratePlans);
  const userKey = user ? `${user.id}:${user.name}:${user.taxResidence ?? ''}` : undefined;
  const [seededUserKey, setSeededUserKey] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [taxResidence, setTaxResidence] = useState<Country>('US');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  // Seed (or refresh) the editable fields when the authenticated user changes.
  if (user && userKey !== seededUserKey) {
    setSeededUserKey(userKey);
    setName(user.name ?? '');
    setTaxResidence(validResidence(user.taxResidence));
  }

  if (!user) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const { error } = await authClient.updateUser({ name: nextName, taxResidence });
      if (error) throw new Error(error.message);
      // A residence must affect the tax engine, which is configured per plan.
      if (taxResidence !== validResidence(user.taxResidence)) {
        setAllResidenceCountries(taxResidence);
      }
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('auth.errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setDeletePassword('');
    setDeleteError(null);
  };

  const deleteAccount = async () => {
    if (!deletePassword) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // Passing the password re-authenticates the request, so Better Auth skips
      // its session-freshness check (sessions older than 24h would otherwise be
      // rejected with SESSION_EXPIRED). It also gates this irreversible action.
      const { error } = await authClient.deleteUser({ password: deletePassword });
      if (error) {
        throw new Error(
          error.code === 'INVALID_PASSWORD'
            ? t('account.deleteInvalidPassword')
            : (error.message ?? t('auth.errorGeneric')),
        );
      }
      // Do not leave a local copy of financial data available after deletion.
      hydratePlans([]);
      navigate('/signin', { replace: true });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t('auth.errorGeneric'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="account-page" aria-labelledby="account-title">
      <div className="page-head">
        <div>
          <h1 id="account-title">{t('account.title')}</h1>
          <p className="page-head__desc">{t('account.description')}</p>
        </div>
      </div>

      <Card padded className="account-card">
        <form onSubmit={save}>
          <div className="account-card__head">
            <div>
              <h2>{t('account.profileTitle')}</h2>
              <p>{t('account.profileDescription')}</p>
            </div>
          </div>

          <div className="account-form-grid">
            <div className="field">
              <label className="field__label" htmlFor="account-email">
                {t('auth.email')}
              </label>
              <input id="account-email" className="search-input" value={user.email} readOnly />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="account-name">
                {t('auth.name')}
              </label>
              <input
                id="account-name"
                className="search-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="account-tax-residence">
                {t('account.taxResidence')}
              </label>
              <select
                id="account-tax-residence"
                className="select"
                value={taxResidence}
                onChange={(event) => setTaxResidence(event.target.value as Country)}
              >
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {COUNTRY_FLAG[country]} {COUNTRY_LABEL[country]}
                  </option>
                ))}
              </select>
              <p className="field__hint">{t('account.taxResidenceHint')}</p>
            </div>
          </div>

          <div className="account-card__actions">
            <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
              {saving ? t('account.saving') : t('common.saveChanges')}
            </Button>
            {saved && <span className="account-success">{t('account.saved')}</span>}
            {saveError && <span className="field-error">{saveError}</span>}
          </div>
        </form>
      </Card>

      <BillingCard />

      <Card padded className="account-card account-card--danger">
        <div className="account-danger">
          <div className="account-danger__icon" aria-hidden="true">
            <AlertIcon size={20} />
          </div>
          <div>
            <h2>{t('account.dangerTitle')}</h2>
            <p>{t('account.dangerDescription')}</p>
          </div>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            <TrashIcon /> {t('account.deleteAccount')}
          </Button>
        </div>
      </Card>

      {confirmOpen && (
        <Modal
          title={t('account.deleteConfirmTitle')}
          description={t('account.deleteConfirmDescription')}
          onClose={() => !deleting && closeConfirm()}
          footer={
            <>
              <Button disabled={deleting} onClick={closeConfirm}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                className="account-delete-confirm"
                disabled={deleting || !deletePassword}
                onClick={() => void deleteAccount()}
              >
                {deleting ? t('account.deleting') : t('account.deleteConfirmCta')}
              </Button>
            </>
          }
        >
          <div className="account-delete-warning">
            <AlertIcon size={19} aria-hidden="true" />
            <p>{t('account.deleteConfirmWarning')}</p>
          </div>
          <form
            className="field"
            onSubmit={(event) => {
              event.preventDefault();
              void deleteAccount();
            }}
          >
            <label className="field__label" htmlFor="account-delete-password">
              {t('account.deletePasswordLabel')}
            </label>
            <input
              id="account-delete-password"
              className="search-input"
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              autoComplete="current-password"
              disabled={deleting}
              autoFocus
            />
            <p className="field__hint">{t('account.deletePasswordHint')}</p>
          </form>
          {deleteError && <p className="field-error">{deleteError}</p>}
        </Modal>
      )}
    </section>
  );
};
