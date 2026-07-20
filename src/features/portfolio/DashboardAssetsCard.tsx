import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { colorForSymbol } from '@/lib/assetColors';
import { gainForHoldings, valueHoldings, type GainSummary } from '@/services/portfolioService';
import type { HoldingValue } from '@/services/portfolioService';
import type { Account } from '@/domain/account';
import type { Holding } from '@/domain/asset';
import type { Plan } from '@/domain/plan';
import type { RatesTable } from '@/services/currencyService';
import { GainLine } from './GainLine';

interface DashboardAssetsCardProps {
  plan: Plan;
  totalValue: number;
  rates: RatesTable | undefined;
}

interface Group {
  key: string;
  account: Account | null; // null = unassigned
  holdings: readonly Holding[];
  subtotal: number;
  gain: GainSummary;
}

/**
 * Compact, read-only assets table for the dashboard, sitting next to the trend
 * chart. Groups holdings by account (plan order) and shows each asset's value in
 * the plan currency, its unrealised gain/loss, and its share of the portfolio.
 * Reuses the same selectors as the full InvestmentBreakdown so the figures match.
 */
export const DashboardAssetsCard = ({ plan, totalValue, rates }: DashboardAssetsCardProps) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);

  // Every holding valued in the plan currency, keyed for per-row lookup.
  const allValues = useMemo<readonly HoldingValue[]>(
    () => valueHoldings(plan.holdings, plan.currency, rates),
    [plan.holdings, plan.currency, rates],
  );

  // Group holdings into account sections (accounts in plan order, then Unassigned),
  // mirroring InvestmentBreakdown so subtotals and gains line up.
  const { groups, valueById } = useMemo(() => {
    const byId = new Map(allValues.map((v) => [v.holdingId, v]));
    const isKnown = (id: string | null): boolean => plan.accounts.some((a) => a.id === id);
    const build = (key: string, account: Account | null, holdings: readonly Holding[]): Group => {
      const vals = holdings
        .map((h) => byId.get(h.id))
        .filter((v): v is HoldingValue => v !== undefined);
      const gain = gainForHoldings(vals, plan.accounts);
      return { key, account, holdings, subtotal: gain.value, gain };
    };

    const accountGroups = plan.accounts.map((account) =>
      build(
        account.id,
        account,
        plan.holdings.filter((h) => h.accountId === account.id),
      ),
    );
    const unassigned = plan.holdings.filter((h) => !isKnown(h.accountId));
    const result = accountGroups.filter((g) => g.holdings.length > 0);
    if (unassigned.length > 0) result.push(build('__unassigned__', null, unassigned));
    return { groups: result, valueById: byId };
  }, [allValues, plan.holdings, plan.accounts]);

  const totalGain = useMemo(
    () => gainForHoldings(allValues, plan.accounts),
    [allValues, plan.accounts],
  );

  if (plan.holdings.length === 0) return null;

  let rowIndex = 0;

  return (
    <Card padded className="dash-assets-card" data-tour="dash-assets-card">
      <div className="mini-assets-scroll">
        <div className="mini-assets">
          <div className="mini-row mini-row--head">
            <span className="mini-row__asset">{t('dashboard.colAsset')}</span>
            <span className="mini-row__value">{t('dashboard.colValue')}</span>
            <span className="mini-row__gain">{t('dashboard.colRoi')}</span>
            <span className="mini-alloc">{t('dashboard.allocation')}</span>
          </div>

          {groups.map((g) => {
            const name = g.account ? g.account.name : t('portfolio.unassigned');
            return (
              <div className="mini-assets__group" key={g.key}>
                <div className="mini-acct">
                  <div className="mini-acct__main">
                    <span className="mini-acct__name">{name}</span>
                    <span className="mini-acct__meta">
                      {t('portfolio.assets', { count: g.holdings.length })}
                    </span>
                  </div>
                  <div className="mini-acct__right">
                    <GainLine gain={g.gain} fmt={fmt} />
                  </div>
                </div>

                {g.holdings.map((h) => {
                  const val = valueById.get(h.id);
                  const value = val?.value ?? 0;
                  const rowGain = val ? gainForHoldings([val], plan.accounts) : null;
                  const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
                  const color = colorForSymbol(h.instrument.symbol, rowIndex++);
                  return (
                    <div className="mini-row" key={h.id}>
                      <div className="mini-row__asset">
                        <span className="asset-badge" style={{ background: color }}>
                          {h.instrument.symbol.slice(0, 1)}
                        </span>
                        <div className="mini-row__text">
                          <div className="mini-row__sym" title={h.instrument.name}>
                            {h.instrument.symbol}
                          </div>
                        </div>
                      </div>
                      <span className="mini-row__value">{fmt.compact(value)}</span>
                      <span className="mini-row__gain">
                        {rowGain && rowGain.pct !== null ? (
                          <GainLine gain={rowGain} fmt={fmt} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </span>
                      <div className="mini-alloc">
                        <div className="mini-alloc__bar">
                          <span
                            className="mini-alloc__fill"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="mini-alloc__pct">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="mini-total">
            <span className="mini-total__label">Total ({plan.currency})</span>
            <GainLine gain={totalGain} fmt={fmt} />
            <span className="mini-total__value">{fmt.format(totalValue)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
