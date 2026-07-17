import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { expenseIncomeItemAmountForYear } from '@/domain/expenseIncome';
import { homeFlows, HOME_FLOW_LABEL_KEY } from '@/domain/home';
import { rentalPropertiesFlows, rentalFlowLabelKey } from '@/domain/rentalProperty';
import type { SamplePathYear } from '@/services/monteCarlo';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  /** The simulated future to tabulate (one sample path's years). */
  years: readonly SamplePathYear[];
  /** Per-asset symbols, in the same order as each year's `assets`. */
  symbols: readonly string[];
  /** Currency formatter (already bound to the plan currency). */
  format: (n: number) => string;
  /** Open/closed state for the expandable balance rows, shared with the caller. */
  openRows: Record<string, boolean>;
  toggleRow: (key: string) => void;
  /** Current age and its year, used to derive the age shown for each column. */
  currentAge: number;
  startYear: number;
}

/**
 * Year-by-year breakdown of a single simulated future — same layout as the main
 * projection table (line items as rows, years as columns), expandable to the
 * per-asset detail. Shown directly under the sample's stacked-asset chart so the
 * two read together.
 */
export const SampleScenarioTable = ({
  plan,
  years,
  symbols,
  format,
  openRows,
  toggleRow,
  currentAge,
  startYear,
}: Props) => {
  const { t } = useTranslation();
  // Show the full plan horizon (through life expectancy), matching the chart's
  // x-axis — flow cashflows and post-depletion years can land anywhere in range.
  const rows = years;
  const hasTax = rows.some((y) => y.tax > 0.5);
  const m = (n: number) => format(Math.round(n));
  // Accounting convention throughout these tables: negative amounts in
  // parentheses, positive amounts with no leading sign.
  const mSigned = (n: number) => (n < 0 ? `(${m(-n)})` : m(n));
  const pct = (n: number) => (n < 0 ? `(${Math.abs(n).toFixed(1)}%)` : `${n.toFixed(1)}%`);
  // "Dépenses & entrées" items, for the combined row's expand-to-detail. Same
  // inflation math the projection loop applies.
  const inflationRate = plan.settings.inflationPct / 100;
  // Include the home's generated cashflows so the expandable breakdown matches the
  // totals (which already include them via the Monte Carlo engine).
  const flowItems = [
    ...(plan.settings.expensesIncomes ?? []),
    ...homeFlows(plan.home, startYear),
    ...rentalPropertiesFlows(plan.properties, startYear, plan.settings.inflationPct),
  ];
  // Disambiguate the home/rental flows (each property's share a name) with a per-type label.
  const flowLabel = (item: (typeof flowItems)[number]): string => {
    const key = HOME_FLOW_LABEL_KEY[item.id] ?? rentalFlowLabelKey(item.id);
    return key ? `${item.name} · ${t(key)}` : item.name;
  };

  const balanceRow = (
    key: string,
    label: string,
    yv: (y: SamplePathYear) => number,
    av: (a: SamplePathYear['assets'][number]) => number,
  ) => (
    <Fragment key={key}>
      <tr>
        <td className="rowlabel">
          <span
            className="expand-toggle"
            role="button"
            tabIndex={0}
            onClick={() => toggleRow(key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') toggleRow(key);
            }}
          >
            <span className="chev">
              {openRows[key] ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
            </span>
            {label}
          </span>
        </td>
        {rows.map((y) => (
          <td key={y.year} className="num">
            {mSigned(yv(y))}
          </td>
        ))}
      </tr>
      {openRows[key] &&
        symbols.map((sym, ai) => (
          <tr key={`${key}-${ai}`} className="asset-detail">
            <td>{sym}</td>
            {rows.map((y) => {
              const a = y.assets[ai];
              return (
                <td key={y.year} className="num">
                  {mSigned(a ? av(a) : 0)}
                </td>
              );
            })}
          </tr>
        ))}
    </Fragment>
  );

  return (
    <div className="mc-table-wrap mc-table-wrap--tall">
      <table className="jtable">
        <thead>
          <tr>
            <th className="rowlabel">{t('jtable.year')}</th>
            {rows.map((y) => (
              <th key={y.year} className="num">
                {y.year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="rowlabel">{t('jtable.age')}</td>
            {rows.map((y) => (
              <td key={y.year} className="num">
                {currentAge + (y.year - startYear)}
              </td>
            ))}
          </tr>
          <Fragment key="return">
            <tr>
              <td className="rowlabel">
                <span
                  className="expand-toggle"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleRow('return')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') toggleRow('return');
                  }}
                >
                  <span className="chev">
                    {openRows.return ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                  </span>
                  {t('jtable.portfolioReturn')}
                </span>
              </td>
              {rows.map((y) => (
                <td
                  key={y.year}
                  className={cn('num', y.portfolioReturnPct >= 0 ? 'mc-pos' : 'mc-neg')}
                >
                  {pct(y.portfolioReturnPct)}
                </td>
              ))}
            </tr>
            {openRows.return &&
              symbols.map((sym, ai) => (
                <tr key={`return-${ai}`} className="asset-detail">
                  <td>{sym}</td>
                  {rows.map((y) => {
                    const a = y.assets[ai];
                    return (
                      <td
                        key={y.year}
                        className={cn('num', (a?.returnPct ?? 0) >= 0 ? 'mc-pos' : 'mc-neg')}
                      >
                        {a ? pct(a.returnPct) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </Fragment>
          {balanceRow(
            'opening',
            t('jtable.opening'),
            (y) => y.openingTotal,
            (a) => a.opening,
          )}
          {balanceRow(
            'appreciation',
            t('jtable.appreciation'),
            (y) => y.appreciation,
            (a) => a.appreciation,
          )}
          <tr>
            <td className="rowlabel">{t('jtable.afterAppreciation')}</td>
            {rows.map((y) => (
              <td key={y.year} className="num">
                {mSigned(y.balanceAfterAppreciation)}
              </td>
            ))}
          </tr>

          <Fragment key="totalIncome">
            <tr>
              <td className="rowlabel">
                <span
                  className="expand-toggle"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleRow('totalIncome')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') toggleRow('totalIncome');
                  }}
                >
                  <span className="chev">
                    {openRows.totalIncome ? (
                      <ChevronUpIcon size={14} />
                    ) : (
                      <ChevronDownIcon size={14} />
                    )}
                  </span>
                  {t('jtable.totalIncome')}
                </span>
              </td>
              {rows.map((y) => {
                const total = y.contributionValue + y.flowIncome;
                return (
                  <td key={y.year} className="num">
                    {total <= 0.5 ? '—' : m(total)}
                  </td>
                );
              })}
            </tr>
            {openRows.totalIncome && (
              <>
                <tr className="asset-detail">
                  <td>{t('jtable.contributions')}</td>
                  {rows.map((y) => (
                    <td key={y.year} className="num">
                      {y.contributionValue > 0.5 ? m(y.contributionValue) : '—'}
                    </td>
                  ))}
                </tr>
                {flowItems
                  .filter((item) => item.kind === 'income')
                  .map((item) => (
                    <tr key={`income-${item.id}`} className="asset-detail">
                      <td>{flowLabel(item)}</td>
                      {rows.map((y) => {
                        const inflationFactor = Math.pow(1 + inflationRate, y.year - startYear);
                        const amount = expenseIncomeItemAmountForYear(
                          item,
                          y.year,
                          inflationFactor,
                        );
                        return (
                          <td key={y.year} className="num">
                            {amount <= 0.5 ? '—' : m(amount)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </>
            )}
          </Fragment>
          <Fragment key="totalExpense">
            <tr>
              <td className="rowlabel">
                <span
                  className="expand-toggle"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleRow('totalExpense')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') toggleRow('totalExpense');
                  }}
                >
                  <span className="chev">
                    {openRows.totalExpense ? (
                      <ChevronUpIcon size={14} />
                    ) : (
                      <ChevronDownIcon size={14} />
                    )}
                  </span>
                  {t('jtable.totalExpense')}
                </span>
              </td>
              {rows.map((y) => {
                const total = y.netWithdrawal + y.flowExpense;
                return (
                  <td key={y.year} className="num spend">
                    {total <= 0.5 ? '—' : `(${m(total)})`}
                  </td>
                );
              })}
            </tr>
            {openRows.totalExpense && (
              <>
                <tr className="asset-detail">
                  <td>{t('jtable.lifestyleSpending')}</td>
                  {rows.map((y) => (
                    <td key={y.year} className="num spend">
                      {y.netWithdrawal > 0.5 ? `(${m(y.netWithdrawal)})` : '—'}
                    </td>
                  ))}
                </tr>
                {flowItems
                  .filter((item) => item.kind === 'expense')
                  .map((item) => (
                    <tr key={`expense-${item.id}`} className="asset-detail">
                      <td>{flowLabel(item)}</td>
                      {rows.map((y) => {
                        const inflationFactor = Math.pow(1 + inflationRate, y.year - startYear);
                        const amount = expenseIncomeItemAmountForYear(
                          item,
                          y.year,
                          inflationFactor,
                        );
                        return (
                          <td key={y.year} className="num spend">
                            {amount <= 0.5 ? '—' : `(${m(amount)})`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </>
            )}
          </Fragment>
          {hasTax && (
            <tr>
              <td className="rowlabel tip-host" tabIndex={0}>
                {t('jtable.taxOnWithdrawal')}
                <span className="tip-bubble" role="tooltip">
                  {t('jtable.taxOnWithdrawalTip')}
                </span>
              </td>
              {rows.map((y) => (
                <td key={y.year} className="num spend">
                  ({m(y.tax)})
                </td>
              ))}
            </tr>
          )}
          {hasTax && (
            <tr>
              <td className="rowlabel tip-host" tabIndex={0}>
                {t('jtable.grossWithdrawal')}
                <span className="tip-bubble" role="tooltip">
                  {t('jtable.grossWithdrawalTip')}
                </span>
              </td>
              {rows.map((y) => (
                <td key={y.year} className="num spend">
                  ({m(y.grossWithdrawal)})
                </td>
              ))}
            </tr>
          )}
          {hasTax && (
            <tr>
              <td className="rowlabel">{t('jtable.effectiveTaxRate')}</td>
              {rows.map((y) => (
                <td key={y.year} className="num">
                  {y.grossWithdrawal > 0.5
                    ? `${((y.tax / y.grossWithdrawal) * 100).toFixed(1)}%`
                    : '—'}
                </td>
              ))}
            </tr>
          )}
          <tr>
            <td className="rowlabel tip-host" tabIndex={0}>
              {t('jtable.withdrawalRate')}
              <span className="tip-bubble" role="tooltip">
                {t('jtable.withdrawalRateTip')}
              </span>
            </td>
            {rows.map((y) => (
              <td key={y.year} className="num">
                {y.openingTotal > 0.5
                  ? `${((y.grossWithdrawal / y.openingTotal) * 100).toFixed(1)}%`
                  : '—'}
              </td>
            ))}
          </tr>
          {balanceRow(
            'closing',
            t('jtable.closing'),
            (y) => y.closingTotal,
            (a) => a.closing,
          )}
        </tbody>
      </table>
    </div>
  );
};
