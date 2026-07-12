import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

/**
 * Shown once, right after a first sign-in on an account that has no server plans
 * yet, when local (guest) plans exist. Non-destructive: the user chooses.
 */
export const ImportLocalPlansDialog = ({
  count,
  onDecide,
}: {
  count: number;
  onDecide: (doImport: boolean) => void | Promise<void>;
}) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const decide = (doImport: boolean) => {
    setBusy(true);
    void Promise.resolve(onDecide(doImport)).finally(() => setBusy(false));
  };

  return (
    <Modal
      title={t('auth.importTitle')}
      description={t('auth.importDesc', { count })}
      onClose={() => decide(false)}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => decide(false)}>
            {t('auth.importStartFresh')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => decide(true)}>
            {busy ? t('auth.importing') : t('auth.importCta')}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{t('auth.importNote')}</p>
    </Modal>
  );
};
