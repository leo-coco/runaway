import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { createScenarioFormSchema, type ScenarioForm } from '@/schemas/scenarioSchema';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  onSave: (form: ScenarioForm) => void;
  onClose: () => void;
}

export const ScenarioModal = ({ plan, onSave, onClose }: Props) => {
  const { t } = useTranslation();
  const scenarioFormSchema = useMemo(() => createScenarioFormSchema(t), [t]);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ScenarioForm>({
    resolver: zodResolver(scenarioFormSchema),
    defaultValues: {
      active: plan.scenario.active,
      conservativeAdjustmentPts: plan.scenario.conservativeAdjustmentPts,
      optimisticAdjustmentPts: plan.scenario.optimisticAdjustmentPts,
    },
  });

  return (
    <Modal
      title={t('modals.scenarioTitle')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit(onSave)}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="adj-grid">
        <div className="adj">
          <span className="adj__label">{t('modals.pessimisticAdj')}</span>
          <div className="adj__row">
            <div className="adj__box">
              <Controller
                control={control}
                name="conservativeAdjustmentPts"
                render={({ field }) => (
                  <Stepper
                    ariaLabel={t('modals.ariaPessAdj')}
                    min={0}
                    step={1}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(errors.conservativeAdjustmentPts)}
                    prefix="-"
                    suffix="%"
                  />
                )}
              />
            </div>
          </div>
        </div>

        <div className="adj">
          <span className="adj__label">{t('modals.expectedAdj')}</span>
          <div className="adj__row">
            <div className="adj__box">
              <Stepper
                ariaLabel={t('modals.expectedAdj')}
                value={0}
                onChange={() => {}}
                suffix="%"
                disabled
              />
            </div>
          </div>
        </div>

        <div className="adj">
          <span className="adj__label">{t('modals.optimisticAdj')}</span>
          <div className="adj__row">
            <div className="adj__box">
              <Controller
                control={control}
                name="optimisticAdjustmentPts"
                render={({ field }) => (
                  <Stepper
                    ariaLabel={t('modals.ariaOptAdj')}
                    min={0}
                    step={1}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(errors.optimisticAdjustmentPts)}
                    prefix="+"
                    suffix="%"
                  />
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
