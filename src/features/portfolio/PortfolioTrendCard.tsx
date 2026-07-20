import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import type { CurrencyCode } from '@/domain/money';
import type { ProjectionResult } from '@/hooks/useProjection';
import { buildGrowthData } from '@/features/projections/chartData';
import { ChartTooltip } from '@/features/projections/ChartTooltip';

interface PortfolioTrendCardProps {
  projection: ProjectionResult;
  currency: CurrencyCode;
}

/**
 * Compact dashboard card showing the projected total portfolio value year by year
 * (the deterministic "growth" curve). Mirrors the growth view in ProjectionsPanel.
 */
export const PortfolioTrendCard = ({ projection, currency }: PortfolioTrendCardProps) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(currency);
  const data = useMemo(() => buildGrowthData(projection.active), [projection]);

  if (data.length === 0) return null;

  const axisTick = { fill: 'var(--text-dim)', fontSize: 11 };

  return (
    <Card padded data-tour="portfolio-trend-card">
      <div className="settings-head">
        <span className="settings-head__title">{t('dashboard.trendTitle')}</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="year" tick={axisTick} stroke="var(--border)" minTickGap={40} />
          <YAxis
            tick={axisTick}
            stroke="var(--border)"
            tickFormatter={(v) => fmt.compact(Number(v))}
            width={60}
          />
          <Tooltip
            content={
              <ChartTooltip
                formatter={(value: unknown) => [
                  fmt.format(Number(value)),
                  t('projChart.seriesPortfolio'),
                ]}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.25}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};
