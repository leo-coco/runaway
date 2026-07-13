import type { CurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { cn } from '@/lib/cn';
import type { GainSummary } from '@/services/portfolioService';

/** Compact "+X.X% (+$Y)" unrealised gain/loss line, coloured by sign. Hidden when
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
    <span className={cn('gain-badge', up ? 'is-pos' : 'is-neg', className)}>
      {`${up ? '+' : ''}${gain.pct.toFixed(1)}% (${up ? '+' : '−'}${fmt.compact(Math.abs(gain.gain))})`}
    </span>
  );
};
