import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { useAppStore } from '@/store';
import { ageForEndYear, lifeExpectancyYear } from '@/domain/retirementSettings';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  onClose: () => void;
}

/**
 * Edits the whole retirement timeline — current age, retirement (age or year) and
 * how long the plan must fund (death age or year). All three write straight to the
 * plan, so the projection and the Monte Carlo both update live. Changing the
 * current age keeps the calendar plan fixed (retirement year and death year stay
 * put) so the simulation horizon doesn't move just from relabelling your age, and
 * retirement is always clamped to land before death.
 */
export const RetirementYearModal = ({ plan, onClose }: Props) => {
  const { t } = useTranslation();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const startYear = new Date().getFullYear();
  const { retirementYear, currentAge, lifeExpectancyAge } = plan.settings;

  const endYear = lifeExpectancyYear(currentAge, startYear, lifeExpectancyAge);
  const retirementAgeValue = ageForEndYear(currentAge, startYear, retirementYear);
  const minEndAge = retirementAgeValue + 1;
  const maxRetireAge = lifeExpectancyAge - 1;
  const maxRetireYear = endYear - 1;

  const setCurrentAge = (age: number) =>
    updateSettings(plan.id, {
      ...plan.settings,
      currentAge: age,
      lifeExpectancyAge: lifeExpectancyAge + (age - currentAge),
    });
  const setRetirementYear = (year: number) =>
    updateSettings(plan.id, {
      ...plan.settings,
      retirementYear: Math.min(Math.max(year, startYear), endYear - 1),
    });
  const setRetirementAge = (age: number) =>
    setRetirementYear(lifeExpectancyYear(currentAge, startYear, Math.min(age, maxRetireAge)));
  const setEndAge = (age: number) =>
    updateSettings(plan.id, { ...plan.settings, lifeExpectancyAge: Math.max(age, minEndAge) });
  const setEndYear = (year: number) =>
    updateSettings(plan.id, {
      ...plan.settings,
      lifeExpectancyAge: ageForEndYear(currentAge, startYear, Math.max(year, retirementYear + 1)),
    });

  return (
    <Modal
      title={t('modals.timelineTitle')}
      description={t('modals.timelineDesc')}
      onClose={onClose}
      wide
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('common.done')}
        </Button>
      }
    >
      <div className="timeline-rows">
        <div className="timeline-row">
          <span className="wo-section-label">{t('modals.currentAge')}</span>
          <div className="timeline-row__inputs">
            <label className="timeline-field">
              <Stepper
                ariaLabel={t('modals.currentAge')}
                value={currentAge}
                min={0}
                max={100}
                step={1}
                suffix={t('modals.yrs')}
                onChange={setCurrentAge}
              />
            </label>
          </div>
        </div>

        <div className="timeline-row">
          <span className="wo-section-label">{t('modals.retireAt')}</span>
          <div className="timeline-row__inputs">
            <label className="timeline-field">
              <span className="ov__sub">{t('modals.age')}</span>
              <Stepper
                ariaLabel={t('modals.ariaAgeRetire')}
                value={retirementAgeValue}
                min={currentAge > 0 ? currentAge : 0}
                max={maxRetireAge}
                step={1}
                suffix={t('modals.yrs')}
                onChange={setRetirementAge}
              />
            </label>
            <span className="mc-horizon__or">{t('modals.or')}</span>
            <label className="timeline-field">
              <span className="ov__sub">{t('modals.year')}</span>
              <Stepper
                ariaLabel={t('modals.ariaYearRetire')}
                value={retirementYear}
                min={startYear}
                max={maxRetireYear}
                step={1}
                onChange={setRetirementYear}
              />
            </label>
          </div>
        </div>

        <div className="timeline-row">
          <span className="wo-section-label">{t('modals.planFundsThrough')}</span>
          <div className="timeline-row__inputs">
            <label className="timeline-field">
              <span className="ov__sub">{t('modals.age')}</span>
              <Stepper
                ariaLabel={t('modals.ariaAgeDeath')}
                value={lifeExpectancyAge}
                min={minEndAge}
                max={120}
                step={1}
                suffix={t('modals.yrs')}
                onChange={setEndAge}
              />
            </label>
            <span className="mc-horizon__or">{t('modals.or')}</span>
            <label className="timeline-field">
              <span className="ov__sub">{t('modals.year')}</span>
              <Stepper
                ariaLabel={t('modals.ariaYearDeath')}
                value={endYear}
                min={retirementYear + 1}
                max={startYear + 90}
                step={1}
                onChange={setEndYear}
              />
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
};
