import type { SuccessBand } from '@/domain/successRate';

export const SUCCESS_BAND_COLOR: Record<SuccessBand, string> = {
  excellent: 'var(--success-band-excellent)',
  good: 'var(--success-band-good)',
  fair: 'var(--success-band-fair)',
  risky: 'var(--success-band-risky)',
  concerning: 'var(--success-band-concerning)',
  nonViable: 'var(--success-band-non-viable)',
};

interface Props {
  percent: number;
  band: SuccessBand;
  label?: string;
  size?: 'default' | 'compact';
  isCalculating?: boolean;
  calculatingLabel?: string;
}

/** Shared Monte-Carlo success-rate donut used on the dashboard and simulation page. */
export const SuccessRateDonut = ({
  percent,
  band,
  label,
  size = 'default',
  isCalculating = false,
  calculatingLabel = 'Calculating…',
}: Props) => (
  <div className="mc-card__donut-wrap">
    <div
      className={[
        'mc-donut',
        size === 'compact' && 'mc-donut--compact',
        isCalculating && 'mc-donut--calculating',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ['--mc-pct' as string]: percent,
        ['--mc-color' as string]: SUCCESS_BAND_COLOR[band],
      }}
      aria-busy={isCalculating}
    >
      <div className="mc-donut__hole">
        {isCalculating ? (
          <span className="mc-donut__loader" role="status" aria-label={calculatingLabel}>
            <span className="mc-donut__spinner" aria-hidden="true" />
          </span>
        ) : (
          <span className="mc-donut__pct">{percent.toFixed(0)}%</span>
        )}
      </div>
    </div>
    {label && <span className="mc-card__donut-label">{label}</span>}
  </div>
);
