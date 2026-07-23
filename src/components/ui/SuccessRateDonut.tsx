import type { SuccessZone } from '@/domain/successRate';

export const SUCCESS_ZONE_COLOR: Record<SuccessZone, string> = {
  strong: 'var(--success)',
  borderline: 'var(--amber)',
  weak: 'var(--danger, #f43f5e)',
};

interface Props {
  percent: number;
  zone: SuccessZone;
  label?: string;
  size?: 'default' | 'compact';
}

/** Shared Monte-Carlo success-rate donut used on the dashboard and simulation page. */
export const SuccessRateDonut = ({ percent, zone, label, size = 'default' }: Props) => (
  <div className="mc-card__donut-wrap">
    <div
      className={`mc-donut${size === 'compact' ? ' mc-donut--compact' : ''}`}
      style={{
        ['--mc-pct' as string]: percent,
        ['--mc-color' as string]: SUCCESS_ZONE_COLOR[zone],
      }}
    >
      <div className="mc-donut__hole">
        <span className="mc-donut__pct">{percent.toFixed(0)}%</span>
      </div>
    </div>
    {label && <span className="mc-card__donut-label">{label}</span>}
  </div>
);
