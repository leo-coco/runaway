import type { CurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { cn } from '@/lib/cn';
import type { GainSummary } from '@/services/portfolioService';

/** Unrealised gain/loss: signed amount followed by a percentage pill, coloured by
 *  sign. Same order and style as the asset rows' Total Return cell. Hidden when
 *  there is no cost basis to compute a percentage from. */
export const GainLine = ({
  gain,
  fmt,
  className,
}: {
  gain: GainSummary;
  fmt: CurrencyFormatter;
  className?: string;
}) => {
  if (gain.pct === null) return null;
  const up = gain.gain >= 0;
  return (
    <div className={cn('ret-cell', up ? 'is-pos' : 'is-neg', className)}>
      <span className="ret-amt">
        {up ? '+' : '−'}
        {fmt.compact(Math.abs(gain.gain))}
      </span>
      <span className="ret-pill">{Math.abs(gain.pct).toFixed(1)}%</span>
    </div>
  );
};
