import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { SunIcon, UmbrellaIcon, UserIcon } from '@/components/icons';
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
  const initialSettings = useRef({ ...plan.settings });
  const startYear = new Date().getFullYear();
  const { retirementYear, currentAge, lifeExpectancyAge } = plan.settings;

  const endYear = lifeExpectancyYear(currentAge, startYear, lifeExpectancyAge);
  const retirementAgeValue = ageForEndYear(currentAge, startYear, retirementYear);
  const minEndAge = retirementAgeValue + 1;
  const maxRetireAge = lifeExpectancyAge - 1;
  const maxRetireYear = endYear - 1;
  const yearsBeforeRetirement = Math.max(0, retirementAgeValue - currentAge);
  const fundedRetirementYears = Math.max(0, lifeExpectancyAge - retirementAgeValue);

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
  const cancel = () => {
    updateSettings(plan.id, initialSettings.current);
    onClose();
  };

  return (
    <Modal
      title={t('modals.timelineTitle')}
      onClose={cancel}
      wide
      className="retirement-timeline-modal"
      footer={
        <>
          <Button onClick={cancel}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={onClose}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="retirement-timeline-form">
        <div className="retirement-timeline">
          <section className="retirement-milestone retirement-milestone--current">
            <span className="retirement-milestone__marker" aria-hidden="true">
              <UserIcon size={17} />
            </span>
            <div className="retirement-milestone__copy">
              <h3>{t('modals.timelineToday')}</h3>
            </div>
            <div className="retirement-milestone__controls retirement-milestone__controls--single">
              <label className="retirement-timeline-field">
                <span className="ov__sub">{t('modals.currentAge')}</span>
                <Stepper
                  ariaLabel={t('modals.currentAge')}
                  value={currentAge}
                  min={0}
                  max={100}
                  step={1}
                  suffix={t('modals.yrs')}
                  onChange={setCurrentAge}
                  splitButtons
                />
              </label>
            </div>
          </section>

          <section className="retirement-milestone retirement-milestone--retirement">
            <span className="retirement-milestone__marker" aria-hidden="true">
              <UmbrellaIcon size={17} />
            </span>
            <div className="retirement-milestone__copy">
              <h3>{t('modals.timelineRetirement')}</h3>
            </div>
            <div className="retirement-milestone__controls">
              <label className="retirement-timeline-field">
                <span className="ov__sub">{t('modals.age')}</span>
                <Stepper
                  ariaLabel={t('modals.ariaAgeRetire')}
                  value={retirementAgeValue}
                  min={currentAge > 0 ? currentAge : 0}
                  max={maxRetireAge}
                  step={1}
                  suffix={t('modals.yrs')}
                  onChange={setRetirementAge}
                  splitButtons
                />
              </label>
              <label className="retirement-timeline-field">
                <span className="ov__sub">{t('modals.year')}</span>
                <Stepper
                  ariaLabel={t('modals.ariaYearRetire')}
                  value={retirementYear}
                  min={startYear}
                  max={maxRetireYear}
                  step={1}
                  onChange={setRetirementYear}
                  splitButtons
                />
              </label>
            </div>
          </section>

          <section className="retirement-milestone retirement-milestone--end">
            <span className="retirement-milestone__marker" aria-hidden="true">
              <SunIcon size={17} />
            </span>
            <div className="retirement-milestone__copy">
              <h3>{t('modals.timelineEnd')}</h3>
            </div>
            <div className="retirement-milestone__controls">
              <label className="retirement-timeline-field">
                <span className="ov__sub">{t('modals.age')}</span>
                <Stepper
                  ariaLabel={t('modals.ariaAgeDeath')}
                  value={lifeExpectancyAge}
                  min={minEndAge}
                  max={120}
                  step={1}
                  suffix={t('modals.yrs')}
                  onChange={setEndAge}
                  splitButtons
                />
              </label>
              <label className="retirement-timeline-field">
                <span className="ov__sub">{t('modals.year')}</span>
                <Stepper
                  ariaLabel={t('modals.ariaYearDeath')}
                  value={endYear}
                  min={retirementYear + 1}
                  max={startYear + 90}
                  step={1}
                  onChange={setEndYear}
                  splitButtons
                />
              </label>
            </div>
          </section>
        </div>

        <div className="contrib-summary">
          <div className="contrib-summary__item">
            <span className="ov__sub">{t('modals.beforeRetirement')}</span>
            <b>{t('modals.yearsCount', { count: yearsBeforeRetirement })}</b>
          </div>
          <div className="contrib-summary__item">
            <span className="ov__sub">{t('modals.fundedRetirementDuration')}</span>
            <b>{t('modals.yearsCount', { count: fundedRetirementYears })}</b>
          </div>
        </div>
      </div>
    </Modal>
  );
};
