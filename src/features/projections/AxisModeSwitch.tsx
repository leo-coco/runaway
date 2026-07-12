import { useTranslation } from 'react-i18next';

export type AxisMode = 'year' | 'age';

interface Props {
  mode: AxisMode;
  onChange: (mode: AxisMode) => void;
}

/** Small toggle placed under a chart's X axis to switch its ticks/tooltip between years and ages. */
export const AxisModeSwitch = ({ mode, onChange }: Props) => {
  const { t } = useTranslation();
  return (
    <div className="axis-mode-switch">
      <span className="gs-unit-toggle" role="group" aria-label={t('mc.axisModeLabel')}>
        <button
          type="button"
          className={mode === 'year' ? 'is-active' : ''}
          aria-pressed={mode === 'year'}
          aria-label={t('mc.ariaAxisYears')}
          onClick={() => onChange('year')}
        >
          {t('mc.axisYears')}
        </button>
        <button
          type="button"
          className={mode === 'age' ? 'is-active' : ''}
          aria-pressed={mode === 'age'}
          aria-label={t('mc.ariaAxisAges')}
          onClick={() => onChange('age')}
        >
          {t('mc.axisAges')}
        </button>
      </span>
    </div>
  );
};
