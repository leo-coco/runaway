import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import { expenseIncomeItemAmountForYear } from '@/domain/expenseIncome';
import { homeFlows, HOME_FLOW_LABEL_KEY } from '@/domain/home';
import { rentalPropertiesFlows, rentalFlowLabelKey } from '@/domain/rentalProperty';
import type { Plan } from '@/domain/plan';
import type { AssetYearValue, Projection, ProjectionYear } from '@/domain/projection';

interface YearlyJourneyTableProps {
  plan: Plan;
  projection: Projection;
}

type RowKey = 'opening' | 'appreciation' | 'closing' | 'totalExpense' | 'totalIncome';

export const YearlyJourneyTable = ({ plan, projection }: YearlyJourneyTableProps) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const [open, setOpen] = useState<Record<RowKey, boolean>>({
    opening: false,
    appreciation: false,
    closing: true,
    totalExpense: false,
    totalIncome: false,
  });
  const toggle = (key: RowKey) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  // Show years through the plan's horizon (the year you reach your life-expectancy
  // age). If savings deplete earlier, stop a year past depletion.
  const years = useMemo(() => {
    const startYear = projection.years[0]?.year ?? new Date().getFullYear();
    const horizonYear = lifeExpectancyYear(
      plan.settings.currentAge,
      startYear,
      plan.settings.lifeExpectancyAge,
    );
    const cap = projection.depletionYear !== null ? projection.depletionYear + 1 : horizonYear;
    return projection.years.filter((y) => y.year <= cap);
  }, [projection, plan.settings.currentAge, plan.settings.lifeExpectancyAge]);

  const symbols = plan.holdings.map((h) => ({ id: h.id, symbol: h.instrument.symbol }));
  const money = (n: number) => fmt.format(Math.round(n));
  // Accounting convention throughout these tables: negative amounts in
  // parentheses, positive amounts with no leading sign.
  const moneySigned = (n: number) => (n < 0 ? `(${money(-n)})` : money(n));
  // Only surface gross/tax rows once tax actually applies (an account is taxed).
  const hasTax = projection.years.some((y) => y.taxPaid > 0.5);
  // Taxed pension/salary/rental income is its own row: it never passes through the
  // portfolio, so it must not be gated on (or folded into) the withdrawal rows.
  const hasFlowIncomeTax = projection.years.some((y) => y.flowIncomeTax > 0.5);
  // "Dépenses & entrées" items, for the combined row's expand-to-detail. Same
  // inflation math the projection loop applies.
  const startYear = projection.years[0]?.year ?? new Date().getFullYear();
  const inflationRate = plan.settings.inflationPct / 100;
  // Include the home's generated cashflows so the expandable breakdown matches the
  // totals (which already include them via the projection engine).
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

  // An expandable summary row: clicking the label reveals each asset's value for
  // that line (opening, appreciation, after-appreciation or closing).
  const expandableRow = (
    key: RowKey,
    label: string,
    rowValue: (y: ProjectionYear) => number,
    assetValue: (a: AssetYearValue) => number,
    fmtCell: (n: number) => string = moneySigned,
  ) => (
    <Fragment key={key}>
      <tr>
        <td className="rowlabel">
          <span
            className="expand-toggle"
            onClick={() => toggle(key)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') toggle(key);
            }}
          >
            <span className="chev">
              {open[key] ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
            </span>
            {label}
          </span>
        </td>
        {years.map((y) => (
          <td key={y.year} className="num">
            {fmtCell(rowValue(y))}
          </td>
        ))}
      </tr>
      {open[key] &&
        symbols.map((s) => (
          <tr key={`${key}-${s.id}`} className="asset-detail">
            <td>{s.symbol}</td>
            {years.map((y) => {
              const cell = y.perAsset.find((a) => a.holdingId === s.id);
              return (
                <td key={y.year} className="num">
                  {fmtCell(cell ? assetValue(cell) : 0)}
                </td>
              );
            })}
          </tr>
        ))}
    </Fragment>
  );

  return (
    <Card className="journey card--pad" data-tour="journey-table">
      <div className="journey__scroll">
        <table className="jtable">
          <thead>
            <tr>
              <th className="rowlabel">{t('jtable.retirementYear')}</th>
              {years.map((y) => (
                <th key={y.year} className="num">
                  {y.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="rowlabel">{t('jtable.age')}</td>
              {years.map((y) => (
                <td key={y.year} className="num">
                  {plan.settings.currentAge + (y.year - (projection.years[0]?.year ?? y.year))}
                </td>
              ))}
            </tr>
            {expandableRow(
              'opening',
              t('jtable.opening'),
              (y) => y.openingBalance,
              (a) => a.opening,
            )}
            {expandableRow(
              'appreciation',
              t('jtable.appreciation'),
              (y) => y.appreciation,
              (a) => a.appreciation,
            )}
            <tr>
              <td className="rowlabel">{t('jtable.afterAppreciation')}</td>
              {years.map((y) => (
                <td key={y.year} className="num">
                  {moneySigned(y.balanceAfterAppreciation)}
                </td>
              ))}
            </tr>
            <Fragment key="totalIncome">
              <tr>
                <td className="rowlabel">
                  <span
                    className="expand-toggle"
                    onClick={() => toggle('totalIncome')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') toggle('totalIncome');
                    }}
                  >
                    <span className="chev">
                      {open.totalIncome ? (
                        <ChevronUpIcon size={14} />
                      ) : (
                        <ChevronDownIcon size={14} />
                      )}
                    </span>
                    {t('jtable.totalIncome')}
                  </span>
                </td>
                {years.map((y) => {
                  const total = y.contributionValue + y.flowIncome;
                  return (
                    <td key={y.year} className="num">
                      {total <= 0.5 ? '—' : money(total)}
                    </td>
                  );
                })}
              </tr>
              {open.totalIncome && (
                <>
                  <tr className="asset-detail">
                    <td>{t('jtable.contributions')}</td>
                    {years.map((y) => (
                      <td key={y.year} className="num">
                        {y.contributionValue > 0.5 ? money(y.contributionValue) : '—'}
                      </td>
                    ))}
                  </tr>
                  {flowItems
                    .filter((item) => item.kind === 'income')
                    .map((item) => (
                      <tr key={`income-${item.id}`} className="asset-detail">
                        <td>{flowLabel(item)}</td>
                        {years.map((y) => {
                          const inflationFactor = Math.pow(1 + inflationRate, y.year - startYear);
                          const amount = expenseIncomeItemAmountForYear(
                            item,
                            y.year,
                            inflationFactor,
                          );
                          return (
                            <td key={y.year} className="num">
                              {amount <= 0.5 ? '—' : money(amount)}
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
                    onClick={() => toggle('totalExpense')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') toggle('totalExpense');
                    }}
                  >
                    <span className="chev">
                      {open.totalExpense ? (
                        <ChevronUpIcon size={14} />
                      ) : (
                        <ChevronDownIcon size={14} />
                      )}
                    </span>
                    {t('jtable.totalExpense')}
                  </span>
                </td>
                {years.map((y) => {
                  const total = y.lifestyleSpending + y.flowExpense;
                  return (
                    <td key={y.year} className="num spend">
                      {total <= 0.5 ? '—' : `(${money(total)})`}
                    </td>
                  );
                })}
              </tr>
              {open.totalExpense && (
                <>
                  <tr className="asset-detail">
                    <td>{t('jtable.lifestyleSpending')}</td>
                    {years.map((y) => (
                      <td key={y.year} className="num spend">
                        {y.lifestyleSpending > 0.5 ? `(${money(y.lifestyleSpending)})` : '—'}
                      </td>
                    ))}
                  </tr>
                  {flowItems
                    .filter((item) => item.kind === 'expense')
                    .map((item) => (
                      <tr key={`expense-${item.id}`} className="asset-detail">
                        <td>{flowLabel(item)}</td>
                        {years.map((y) => {
                          const inflationFactor = Math.pow(1 + inflationRate, y.year - startYear);
                          const amount = expenseIncomeItemAmountForYear(
                            item,
                            y.year,
                            inflationFactor,
                          );
                          return (
                            <td key={y.year} className="num spend">
                              {amount <= 0.5 ? '—' : `(${money(amount)})`}
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
                {years.map((y) => (
                  <td key={y.year} className="num spend">
                    ({money(y.taxPaid)})
                  </td>
                ))}
              </tr>
            )}
            {hasFlowIncomeTax && (
              <tr>
                <td className="rowlabel tip-host" tabIndex={0}>
                  {t('jtable.taxOnIncome')}
                  <span className="tip-bubble" role="tooltip">
                    {t('jtable.taxOnIncomeTip')}
                  </span>
                </td>
                {years.map((y) => (
                  <td key={y.year} className="num spend">
                    ({money(y.flowIncomeTax)})
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
                {years.map((y) => (
                  <td key={y.year} className="num spend">
                    ({money(y.grossWithdrawal)})
                  </td>
                ))}
              </tr>
            )}
            {hasTax && (
              <tr>
                <td className="rowlabel tip-host" tabIndex={0}>
                  {t('jtable.effectiveTaxRate')}
                  <span className="tip-bubble" role="tooltip">
                    {t('jtable.effectiveTaxRateTip')}
                  </span>
                </td>
                {years.map((y) => (
                  <td key={y.year} className="num">
                    {y.grossWithdrawal > 0.5
                      ? `${((y.taxPaid / y.grossWithdrawal) * 100).toFixed(1)}%`
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
              {years.map((y) => (
                <td key={y.year} className="num">
                  {y.openingBalance > 0.5
                    ? `${((y.grossWithdrawal / y.openingBalance) * 100).toFixed(1)}%`
                    : '—'}
                </td>
              ))}
            </tr>
            {expandableRow(
              'closing',
              t('jtable.closing'),
              (y) => y.closingBalance,
              (a) => a.value,
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
