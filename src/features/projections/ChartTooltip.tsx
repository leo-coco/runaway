import type { ReactNode } from 'react';

/**
 * Recharts 3's `TooltipContentProps` ties `formatter`/`payload` to its own
 * internal generic types, which don't actually agree with each other (the
 * `payload` entries are always the widest `Payload<ValueType, NameType>`
 * regardless of the generics passed to `TooltipContentProps`). Defining our
 * own narrow shape — matching what this tooltip actually reads — sidesteps
 * that inconsistency instead of fighting it at every call site.
 */
export interface ChartTooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number | readonly (string | number)[];
  color?: string;
  fill?: string;
  stroke?: string;
}

export type ChartTooltipFormatter = (
  value: ChartTooltipEntry['value'],
  name: ChartTooltipEntry['name'],
  entry: ChartTooltipEntry,
  index: number,
  payload: readonly ChartTooltipEntry[],
) => [ReactNode, ReactNode] | ReactNode;

export type ChartTooltipLabelFormatter = (
  label: string | number,
  payload?: readonly ChartTooltipEntry[],
) => ReactNode;

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly ChartTooltipEntry[];
  label?: string | number;
  formatter?: ChartTooltipFormatter;
  labelFormatter?: ChartTooltipLabelFormatter;
}

/**
 * Shared tooltip content for the projection/trial-explorer charts, styled to match
 * the Monte Carlo fan chart's tooltip (`.mc-fan-tip`) so hover labels stay legible
 * in both themes instead of relying on Recharts' hardcoded default colors.
 */
export const ChartTooltip = ({ active, payload, label, formatter, labelFormatter }: ChartTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="mc-fan-tip">
      <div className="mc-fan-tip__year">
        {labelFormatter && label !== undefined ? labelFormatter(label, payload) : label}
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
