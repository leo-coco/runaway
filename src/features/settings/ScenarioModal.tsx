import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { TrendingUpIcon } from '@/components/icons';
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
      className="scenario-adjustment-modal"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit(onSave)}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="scenario-adjustments">
        <div className="scenario-adjustment scenario-adjustment--conservative">
          <span className="scenario-adjustment__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <polyline points="3 6 9 12 13 8 21 16" />
              <polyline points="15 16 21 16 21 10" />
            </svg>
          </span>
          <div className="scenario-adjustment__copy">
            <strong>{t('overview.scenarioConservative')}</strong>
            <span>{t('modals.scenarioDescConservative')}</span>
          </div>
          <div className="scenario-adjustment__control">
            <div className="scenario-adjustment__stepper">
              <Controller
                control={control}
                name="conservativeAdjustmentPts"
                render={({ field }) => (
                  <Stepper
                    ariaLabel={t('modals.ariaPessAdj')}
                    min={0}
                    max={50}
                    step={1}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(errors.conservativeAdjustmentPts)}
                    suffix="%"
                  />
                )}
              />
            </div>
          </div>
        </div>

        <div className="scenario-adjustment scenario-adjustment--expected">
          <span className="scenario-adjustment__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <line x1="6" y1="9" x2="18" y2="9" />
              <line x1="6" y1="15" x2="18" y2="15" />
            </svg>
          </span>
          <div className="scenario-adjustment__copy">
            <div className="scenario-adjustment__heading">
              <strong>{t('overview.scenarioExpected')}</strong>
              <span className="scenario-adjustment__reference">{t('modals.reference')}</span>
            </div>
            <span>{t('modals.scenarioDescExpected')}</span>
          </div>
          <div
            className="scenario-adjustment__control scenario-adjustment__static"
            aria-label={t('modals.expectedAdj')}
          >
            0 <span>%</span>
          </div>
        </div>

        <div className="scenario-adjustment scenario-adjustment--optimistic">
          <span className="scenario-adjustment__icon" aria-hidden="true">
            <TrendingUpIcon size={28} />
          </span>
          <div className="scenario-adjustment__copy">
            <strong>{t('overview.scenarioOptimistic')}</strong>
            <span>{t('modals.scenarioDescOptimistic')}</span>
          </div>
          <div className="scenario-adjustment__control">
            <div className="scenario-adjustment__stepper">
              <Controller
                control={control}
                name="optimisticAdjustmentPts"
                render={({ field }) => (
                  <Stepper
                    ariaLabel={t('modals.ariaOptAdj')}
                    min={0}
                    max={50}
                    step={1}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(errors.optimisticAdjustmentPts)}
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
