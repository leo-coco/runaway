import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { scenarioFormSchema, type ScenarioForm } from '@/schemas/scenarioSchema';
import { SCENARIOS, type ScenarioKey } from '@/domain/scenario';
import type { Plan } from '@/domain/plan';
import { cn } from '@/lib/cn';

const SCENARIO_NAME_KEY: Record<ScenarioKey, string> = {
  conservative: 'overview.scenarioConservative',
  expected: 'overview.scenarioExpected',
  optimistic: 'overview.scenarioOptimistic',
};
const SCENARIO_DESC_KEY: Record<ScenarioKey, string> = {
  conservative: 'modals.scenarioDescConservative',
  expected: 'modals.scenarioDescExpected',
  optimistic: 'modals.scenarioDescOptimistic',
};

interface Props {
  plan: Plan;
  onSave: (form: ScenarioForm) => void;
  onClose: () => void;
}

export const ScenarioModal = ({ plan, onSave, onClose }: Props) => {
  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ScenarioForm>({
    resolver: zodResolver(scenarioFormSchema),
    defaultValues: {
      active: plan.scenario.active,
      conservativeAdjustmentPts: plan.scenario.conservativeAdjustmentPts,
      optimisticAdjustmentPts: plan.scenario.optimisticAdjustmentPts,
    },
  });

  const active = useWatch({ control, name: 'active' });

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
      <div className="eyebrow" style={{ fontSize: '1rem', color: 'var(--text)', fontWeight: 700 }}>
        {t('modals.selectScenario')}
      </div>

      <div className="scenario-grid">
        {SCENARIOS.map((key: ScenarioKey) => (
          <button
            key={key}
            type="button"
            className={cn('scenario-card', active === key && 'active')}
            onClick={() => setValue('active', key, { shouldDirty: true })}
          >
            {active === key && <span className="dot" />}
            <h4>{t(SCENARIO_NAME_KEY[key])}</h4>
            <p>{t(SCENARIO_DESC_KEY[key])}</p>
          </button>
        ))}
      </div>

      <div className="divider" />
      <div className="adj-grid">
        <div className="adj">
          <span className="adj__label">{t('modals.pessimisticAdj')}</span>
          <div className="adj__row">
            <span className="adj__sign">–</span>
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
                  />
                )}
              />
            </div>
            <span className="adj__unit">bp</span>
          </div>
        </div>

        <div className="adj">
          <span className="adj__label">{t('modals.expectedAdj')}</span>
          <div className="adj__row">
            <span className="adj__static">0</span>
          </div>
        </div>

        <div className="adj">
          <span className="adj__label">{t('modals.optimisticAdj')}</span>
          <div className="adj__row">
            <span className="adj__sign">+</span>
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
                  />
                )}
              />
            </div>
            <span className="adj__unit">bp</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
