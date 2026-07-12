import type { TooltipContentProps } from 'recharts';

/**
 * Shared tooltip content for the projection/trial-explorer charts, styled to match
 * the Monte Carlo fan chart's tooltip (`.mc-fan-tip`) so hover labels stay legible
 * in both themes instead of relying on Recharts' hardcoded default colors.
 */
export const ChartTooltip = ({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: TooltipContentProps<number | string, number | string>) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="mc-fan-tip">
      <div className="mc-fan-tip__year">
        {labelFormatter ? labelFormatter(label, payload) : label}
      </div>
      {payload.map((entry, i) => {
        const formatted = formatter
          ? formatter(entry.value, entry.name, entry, i, payload)
          : [entry.value, entry.name];
        const [formattedValue, formattedName] = Array.isArray(formatted)
          ? formatted
          : [formatted, entry.name];
        return (
          <div key={entry.dataKey ?? i} className="mc-fan-tip__row">
            <i style={{ background: entry.color ?? entry.fill ?? entry.stroke }} />
            <span>{formattedName}</span>
            <b>{formattedValue}</b>
          </div>
        );
      })}
    </div>
  );
};
