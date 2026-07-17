import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PlusIcon, PencilIcon, TrashIcon } from '@/components/icons';
import { useAppStore } from '@/store';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { rentalPropertyEquitySeries, type RentalProperty } from '@/domain/rentalProperty';
import type { Plan } from '@/domain/plan';
import { RentalPropertyDialog } from './RentalPropertyDialog';

interface Props {
  plan: Plan;
  onClose: () => void;
}

/**
 * Manage the plan's rental properties: a list with add/edit/remove, each opening
 * the full {@link RentalPropertyDialog} editor. Rental cashflows (rent, mortgage,
 * operating costs, sale) drive the projection and Monte Carlo; equity is tracked
 * separately for the net-worth view.
 */
export const RentalPropertiesModal = ({ plan, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const addProperty = useAppStore((s) => s.addProperty);
  const updateProperty = useAppStore((s) => s.updateProperty);
  const removeProperty = useAppStore((s) => s.removeProperty);
  const startYear = new Date().getFullYear();
  const properties = useMemo(() => plan.properties ?? [], [plan.properties]);
  const [editing, setEditing] = useState<RentalProperty | 'new' | null>(null);

  const equityNow = (p: RentalProperty): number =>
    rentalPropertyEquitySeries(p, startYear, 0)[0]?.equity ?? 0;
  const totalEquity = properties.reduce((sum, p) => sum + equityNow(p), 0);
  const totalMonthlyRent = properties.reduce((sum, p) => sum + p.monthlyRent, 0);

  const handleSave = (data: Omit<RentalProperty, 'id'>) => {
    if (editing === 'new') addProperty(plan.id, data);
    else if (editing) updateProperty(plan.id, editing.id, data);
  };

  return (
    <>
      <Modal
        title={t('rental.title')}
        description={t('rental.listDesc')}
        onClose={onClose}
        wide
        className="modal--flows"
        footer={
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        }
      >
        <div className="flows-modal-content">
          <div className="contrib-summary" aria-label={t('rental.summaryLabel')}>
            <div className="contrib-summary__item">
              <span className="ov__sub">
                {t('rental.summaryEquity', { currency: plan.currency })}
              </span>
              <b>{fmt.format(totalEquity)}</b>
            </div>
            <div className="contrib-summary__item">
              <span className="ov__sub">
                {t('rental.summaryRent', { currency: plan.currency })}
              </span>
              <b className="is-pos">+{fmt.format(totalMonthlyRent)}</b>
            </div>
          </div>

          <section className="flow-list-section" aria-label={t('rental.listTitle')}>
            <div className="flow-list__head">
              <h3 className="flow-list__title">{t('rental.listTitle')}</h3>
              <Button
                variant="accent"
                className="flow-list__add-button"
                onClick={() => setEditing('new')}
              >
                <PlusIcon size={15} /> {t('rental.add')}
              </Button>
            </div>

            <div className="flow-list">
              {properties.length === 0 ? (
                <div className="state-box flow-list__empty">{t('rental.empty')}</div>
              ) : (
                <div className="flow-table" role="table" aria-label={t('rental.listTitle')}>
                  <div className="flow-table__header" role="row">
                    <span role="columnheader">{t('rental.columnName')}</span>
                    <span role="columnheader">
                      {t('rental.columnRent', { currency: plan.currency })}
                    </span>
                    <span role="columnheader">
                      {t('rental.columnEquity', { currency: plan.currency })}
                    </span>
                    <span role="columnheader" className="flow-table__action-heading">
                      {t('common.action')}
                    </span>
                  </div>
                  <div role="rowgroup">
                    {properties.map((p) => (
                      <div className="flow-table__row" role="row" key={p.id}>
                        <div className="flow-table__cell flow-table__flow" role="cell">
                          <strong>{p.name || t('rental.defaultName')}</strong>
                        </div>
                        <div
                          className="flow-table__cell flow-table__amount"
                          role="cell"
                          data-label={t('rental.columnRent', { currency: plan.currency })}
                        >
                          <span className="is-income">
                            {fmt.compact(p.monthlyRent)}
                            {t('common.perMonth')}
                          </span>
                        </div>
                        <div
                          className="flow-table__cell"
                          role="cell"
                          data-label={t('rental.columnEquity', { currency: plan.currency })}
                        >
                          {fmt.compact(equityNow(p))}
                        </div>
                        <div className="flow-table__cell flow-table__actions" role="cell">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="icon-action"
                            aria-label={t('rental.editAria', { name: p.name })}
                            onClick={() => setEditing(p)}
                          >
                            <PencilIcon size={14} />
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            className="icon-action"
                            aria-label={t('rental.removeAria', { name: p.name })}
                            onClick={() => removeProperty(plan.id, p.id)}
                          >
                            <TrashIcon size={14} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </Modal>

      {editing !== null && (
        <RentalPropertyDialog
          plan={plan}
          initial={editing === 'new' ? undefined : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};
