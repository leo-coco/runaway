import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { BuildingIcon, HomeIcon } from '@/components/icons';
import { useAppStore } from '@/store';
import { cn } from '@/lib/cn';
import type { Plan } from '@/domain/plan';
import type { RentalProperty } from '@/domain/rentalProperty';
import { HomePropertyForm } from './HomePropertyForm';
import { RentalPropertyForm } from './RentalPropertyForm';

/** Handle a form body exposes so the shared footer can trigger validation + save. */
export interface PropertyFormHandle {
  submit: () => void;
}

/** What the dialog opens on: add a new property, or edit an existing one. */
export type PropertyDialogTarget =
  | { mode: 'new' }
  | { mode: 'edit-home' }
  | { mode: 'edit-rental'; property: RentalProperty };

type PropertyType = 'home' | 'rental';

interface Props {
  plan: Plan;
  target: PropertyDialogTarget;
  onClose: () => void;
}

/**
 * Unified add/edit dialog for a real-estate asset. A "Type de bien" toggle swaps
 * the primary-residence body ({@link HomePropertyForm}) and the rental body
 * ({@link RentalPropertyForm}); each keeps its own schema and domain treatment.
 * The dialog owns the shared shell (title, type toggle, footer) and routes save
 * through the active body's {@link PropertyFormHandle}. When editing, the type is
 * locked; when adding, "Résidence principale" is disabled if one already exists.
 */
export const PropertyDialog = ({ plan, target, onClose }: Props) => {
  const { t } = useTranslation();
  const removeHome = useAppStore((s) => s.removeHome);
  const removeProperty = useAppStore((s) => s.removeProperty);

  const editing = target.mode !== 'new';
  const homeExists = !!plan.home;
  const homeDisabled = target.mode === 'edit-rental' || (target.mode === 'new' && homeExists);
  const rentalDisabled = target.mode === 'edit-home';

  const initialType: PropertyType =
    target.mode === 'edit-home'
      ? 'home'
      : target.mode === 'edit-rental'
        ? 'rental'
        : homeExists
          ? 'rental'
          : 'home';
  const [type, setType] = useState<PropertyType>(initialType);

  const formRef = useRef<PropertyFormHandle>(null);

  const handleRemove = () => {
    if (target.mode === 'edit-home') removeHome(plan.id);
    else if (target.mode === 'edit-rental') removeProperty(plan.id, target.property.id);
    onClose();
  };

  const typeButton = (
    value: PropertyType,
    label: string,
    Icon: typeof HomeIcon,
    disabled: boolean,
  ) => (
    <button
      type="button"
      className={cn('realestate-typetoggle__btn', type === value && 'is-active')}
      aria-pressed={type === value}
      disabled={disabled}
      onClick={() => setType(value)}
    >
      <Icon size={15} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <Modal
      title={editing ? t('realEstate.editTitle') : t('realEstate.addTitle')}
      description={t('realEstate.dialogDesc')}
      onClose={onClose}
      wide
      className="home-modal"
      footer={
        <>
          {editing && (
            <Button variant="danger" onClick={handleRemove} style={{ marginRight: 'auto' }}>
              {t('common.delete')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => formRef.current?.submit()}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="realestate-type">
        <span className="ov__sub">{t('realEstate.typeLabel')}</span>
        <div className="realestate-typetoggle" role="group" aria-label={t('realEstate.typeLabel')}>
          {typeButton('home', t('realEstate.typeHome'), HomeIcon, homeDisabled)}
          {typeButton('rental', t('realEstate.typeRental'), BuildingIcon, rentalDisabled)}
        </div>
        <p className="field__hint realestate-type__hint">{t('realEstate.uniqueResidence')}</p>
      </div>

      {type === 'home' ? (
        <HomePropertyForm ref={formRef} plan={plan} onSaved={onClose} />
      ) : (
        <RentalPropertyForm
          ref={formRef}
          plan={plan}
          initial={target.mode === 'edit-rental' ? target.property : undefined}
          onSaved={onClose}
        />
      )}
    </Modal>
  );
};
