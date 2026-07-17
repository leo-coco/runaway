import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { Toggle } from '@/components/ui/Toggle';
import { PlusIcon, TrashIcon } from '@/components/icons';
import { useAppStore } from '@/store';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { rmdStartAge } from '@/domain/taxAdvantaged';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  onClose: () => void;
}

/**
 * Configure tax-deferred → tax-free conversions / meltdown and the RMD toggle.
 * Only meaningful for US (Roth + RMD at 73) and Canada (meltdown + RRIF at 72).
 */
export const ConversionsModal = ({ plan, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const setRmdEnabled = useAppStore((s) => s.setRmdEnabled);
  const addConversion = useAppStore((s) => s.addConversion);
  const updateConversion = useAppStore((s) => s.updateConversion);
  const removeConversion = useAppStore((s) => s.removeConversion);

  const residence = plan.residenceCountry ?? 'US';
  // US RMD age depends on the birth year (SECURE 2.0): 75 for those born ≥ 1960.
  const birthYear =
    plan.settings.currentAge && plan.settings.currentAge > 0
      ? new Date().getFullYear() - plan.settings.currentAge
      : null;
  const rmdAge = rmdStartAge(residence, birthYear);
  const supported = rmdAge !== undefined; // US / CA
  const conversions = plan.settings.conversions ?? [];
  const rmdEnabled = plan.settings.rmdEnabled ?? true;
  const deferredAccounts = plan.accounts.filter((a) => (a.kind ?? 'taxable') === 'tax_deferred');
  // The engine can only land converted principal in an account that holds at
  // least one asset (it skips the conversion otherwise), so only offer those.
  const accountsWithHoldings = new Set(
    plan.holdings.map((h) => h.accountId).filter((id): id is string => id != null),
  );

  return (
    <Modal
      title={t('conversions.title')}
      description={t('conversions.desc')}
      onClose={onClose}
      wide
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('common.done')}
        </Button>
      }
    >
      {!supported ? (
        <div className="state-box">{t('conversions.unsupported')}</div>
      ) : (
        <>
          <div className="field toggle-row">
            <span className="field__label" style={{ marginBottom: 0 }}>
              {t('conversions.rmdLabel', { age: rmdAge })}
            </span>
            <Toggle
              checked={rmdEnabled}
              onChange={(v) => setRmdEnabled(plan.id, v)}
              label={t('conversions.rmdLabel', { age: rmdAge })}
            />
          </div>
          <p className="field__hint">{t('conversions.rmdHint')}</p>

          <div className="divider" />

          <div className="wo-section-label">{t('conversions.plansTitle')}</div>

          {deferredAccounts.length === 0 ? (
            <div className="state-box">{t('conversions.needDeferred')}</div>
          ) : conversions.length === 0 ? (
            <div className="state-box">{t('conversions.empty')}</div>
          ) : (
            <div className="acct-cards">
              {conversions.map((c) => (
                <div className="acct-card" key={c.id}>
                  <div className="acct-card__head">
                    <span className="acct-card__eff">
                      {fmt.compact(c.annualAmount)}
                      {t('common.perYear')}
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      className="icon-action"
                      aria-label={t('conversions.removeAria')}
                      onClick={() => removeConversion(plan.id, c.id)}
                    >
                      <TrashIcon size={16} />
                    </Button>
                  </div>

                  <div className="acct-card__row">
                    <label className="acct-field">
                      <span className="ov__sub">{t('conversions.from')}</span>
                      <select
                        className="select"
                        value={c.fromAccountId}
                        onChange={(e) =>
                          updateConversion(plan.id, c.id, { fromAccountId: e.target.value })
                        }
                      >
                        {deferredAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="acct-field">
                      <span className="ov__sub">{t('conversions.to')}</span>
                      <select
                        className="select"
                        value={c.toAccountId}
                        onChange={(e) =>
                          updateConversion(plan.id, c.id, { toAccountId: e.target.value })
                        }
                      >
                        {plan.accounts
                          .filter(
                            (a) =>
                              a.id !== c.fromAccountId &&
                              (accountsWithHoldings.has(a.id) || a.id === c.toAccountId),
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>

                  <div className="acct-card__row">
                    <label className="acct-field">
                      <span className="ov__sub">{t('conversions.annualAmount')}</span>
                      <Stepper
                        ariaLabel={t('conversions.annualAmount')}
                        suffix={plan.currency}
                        min={0}
                        step={1000}
                        value={c.annualAmount}
                        onChange={(v) => updateConversion(plan.id, c.id, { annualAmount: v })}
                      />
                    </label>
                    <label className="acct-field">
                      <span className="ov__sub">{t('conversions.startAge')}</span>
                      <Stepper
                        ariaLabel={t('conversions.startAge')}
                        suffix={t('conversions.yearsSuffix')}
                        min={0}
                        max={120}
                        step={1}
                        value={c.startAge}
                        onChange={(v) => updateConversion(plan.id, c.id, { startAge: v })}
                      />
                    </label>
                    <label className="acct-field">
                      <span className="ov__sub">{t('conversions.endAge')}</span>
                      <Stepper
                        ariaLabel={t('conversions.endAge')}
                        suffix={t('conversions.yearsSuffix')}
                        min={0}
                        max={120}
                        step={1}
                        value={c.endAge}
                        onChange={(v) => updateConversion(plan.id, c.id, { endAge: v })}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {deferredAccounts.length > 0 && (
            <Button
              variant="accent"
              onClick={() => addConversion(plan.id)}
              style={{ marginTop: 12 }}
            >
              <PlusIcon /> {t('conversions.add')}
            </Button>
          )}

          <p className="field__hint" style={{ marginTop: 14 }}>
            {t('conversions.hint')}
          </p>
        </>
      )}
    </Modal>
  );
};
