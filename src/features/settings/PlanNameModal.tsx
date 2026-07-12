import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { planNameFormSchema, type PlanNameForm } from '@/schemas/planNameSchema';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  onSave: (form: PlanNameForm) => void;
  onClose: () => void;
}

export const PlanNameModal = ({ plan, onSave, onClose }: Props) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PlanNameForm>({
    resolver: zodResolver(planNameFormSchema),
    defaultValues: { name: plan.name, description: plan.description },
  });

  return (
    <Modal
      title={t('modals.planNameTitle')}
      description={t('modals.planNameDesc')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit(onSave)}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="plan-name">
          {t('modals.planName')}
        </label>
        <input id="plan-name" className="search-input" {...register('name')} />
        {errors.name && <p className="field-error">{errors.name.message}</p>}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="plan-desc">
          {t('modals.description')}
        </label>
        <input id="plan-desc" className="search-input" {...register('description')} />
        {errors.description && <p className="field-error">{errors.description.message}</p>}
      </div>
    </Modal>
  );
};
