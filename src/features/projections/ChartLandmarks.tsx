import type { ReactNode } from 'react';

export const LANDMARK_COLOR = 'var(--chart-landmark-line)';

/**
 * Keeps an axis readable while guaranteeing that its landmark years are ticks.
 * Regular ticks too close to a landmark are dropped to avoid overlapping text.
 */
export const buildLandmarkTicks = (
  years: readonly number[],
  importantYears: readonly number[],
  maxRegularTicks = 8,
): number[] => {
  if (years.length === 0) return [];

  const firstYear = years[0]!;
  const lastYear = years[years.length - 1]!;
  const visibleImportantYears = importantYears.filter(
    (year) => year >= firstYear && year <= lastYear,
  );
  const stride = Math.max(1, Math.ceil((years.length - 1) / Math.max(1, maxRegularTicks - 1)));
  const regularYears = years.filter(
    (year, index) =>
      (index === 0 || index === years.length - 1 || index % stride === 0) &&
      visibleImportantYears.every((importantYear) => Math.abs(year - importantYear) > 2),
  );

  return [...new Set([...regularYears, ...visibleImportantYears])].sort((a, b) => a - b);
};

interface LandmarkLabelProps {
  value: ReactNode;
  align?: 'left' | 'right' | 'center';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  tone?: 'default' | 'danger';
  viewBox?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

/**
 * Compact, high-contrast label for a vertical chart landmark. Recharts injects
 * the reference line's viewBox when it clones this element.
 */
export const LandmarkLabel = ({
  value,
  align = 'left',
  verticalAlign = 'bottom',
  tone = 'default',
  viewBox,
}: LandmarkLabelProps) => {
  const text = String(value);
  const lineX = viewBox?.x ?? 0;
  const chartY = viewBox?.y ?? 0;
  const chartHeight = viewBox?.height ?? 0;
  const width = Math.max(46, text.length * 6.1 + 16);
  const height = 22;
  const x =
    align === 'right' ? lineX - width - 5 : align === 'center' ? lineX - width / 2 : lineX + 5;
  const y =
    verticalAlign === 'top'
      ? chartY + 5
      : verticalAlign === 'middle'
        ? chartY + (chartHeight - height) / 2
        : chartY + chartHeight - height - 5;

  return (
    <g className="chart-landmark-label">
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={5}
        fill={tone === 'danger' ? 'var(--danger)' : 'var(--chart-landmark-label-bg)'}
      />
      <text
        x={x + width / 2}
        y={y + height / 2}
        fill={tone === 'danger' ? 'var(--danger-contrast)' : 'var(--chart-landmark-label-fg)'}
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  );
};

interface ImportantYearTickProps {
  x?: number;
  y?: number;
  payload?: { value: number | string };
  importantYears: readonly number[];
  dangerYears?: readonly number[];
  firstYear?: number;
  lastYear?: number;
  formatter: (value: number) => string;
}

/** X-axis tick that gives retirement and plan-end years extra emphasis. */
export const ImportantYearTick = ({
  x = 0,
  y = 0,
  payload,
  importantYears,
  dangerYears = [],
  firstYear,
  lastYear,
  formatter,
}: ImportantYearTickProps) => {
  const year = Number(payload?.value);
  const isImportant = importantYears.includes(year);
  const isDanger = dangerYears.includes(year);
  const isFirst = year === firstYear;
  const isLast = year === lastYear;

  return (
    <text
      x={isFirst ? x + 2 : isLast ? x - 2 : x}
      y={y}
      dy={16}
      fill={isDanger ? 'var(--danger)' : isImportant ? 'var(--text)' : 'var(--text-dim)'}
      fontSize={11}
      fontWeight={isImportant || isDanger ? 700 : 400}
      textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
    >
      {formatter(year)}
    </text>
  );
};
