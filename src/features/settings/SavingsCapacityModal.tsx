import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { convertChecked } from '@/services/currencyService';
import { contributionFutureValue } from '@/services/retirementCalculator';
import { scenarioAdjustmentPts } from '@/domain/scenario';
import type { Holding } from '@/domain/asset';
import type { Plan } from '@/domain/plan';
import { colorForSymbol } from '@/lib/assetColors';

const truncate = (text: string, maxLength: number) =>
  text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;

const plainNumberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const formatPlain = (amount: number): string => plainNumberFmt.format(amount);

interface Props {
  plan: Plan;
  onSave: (contributions: Record<string, number>) => void;
  onClose: () => void;
}

/** One asset's monthly-contribution input with its annual (no-CAGR) and projected (with-CAGR) values. */
const ContributionRow = ({
  holding,
  index,
  value,
  effectiveCagrPct,
  yearsToRetirement,
  onChange,
}: {
  holding: Holding;
  index: number;
  value: number;
  effectiveCagrPct: number;
  yearsToRetirement: number;
  onChange: (next: number) => void;
}) => {
  const { t } = useTranslation();
  const nativeFmt = useCurrencyFormatter(holding.instrument.nativeCurrency);
  const projected = contributionFutureValue(value, effectiveCagrPct, yearsToRetirement);

  return (
    <div className="contrib-table__row" role="row">
      <div className="contrib-table__cell contrib-table__asset" role="cell">
        <div className="asset-id">
          <span
            className="asset-badge"
            style={{ background: colorForSymbol(holding.instrument.symbol, index) }}
          >
            {holding.instrument.symbol.slice(0, 1)}
          </span>
          <div className="asset-id__text">
            <span className="asset-sym">{holding.instrument.symbol}</span>
            <span className="asset-nm">{truncate(holding.instrument.name, 4)}</span>
          </div>
        </div>
      </div>
      <div className="contrib-table__cell contrib-table__monthly" role="cell">
        <Stepper
          ariaLabel={t('savings.ariaMonthly', { symbol: holding.instrument.symbol })}
          value={value}
          min={0}
          step={50}
          suffix={holding.instrument.nativeCurrency}
          onChange={onChange}
        />
      </div>
      <div className="contrib-table__cell contrib-table__annual" role="cell">
        {nativeFmt.format(value * 12)}
      </div>
      <div className="contrib-table__cell contrib-table__projected" role="cell">
        {nativeFmt.format(projected)}
      </div>
    </div>
  );
};

export const SavingsCapacityModal = ({ plan, onSave, onClose }: Props) => {
  const { t } = useTranslation();
  const fx = useExchangeRate(plan.currency);
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(plan.holdings.map((h) => [h.id, h.monthlyContribution ?? 0])),
  );
  // A lump monthly amount (plan currency) the user can split equally across assets.
  const [spread, setSpread] = useState(0);
  const [automaticDistributionApplied, setAutomaticDistributionApplied] = useState(false);

  const scenarioAdj = scenarioAdjustmentPts(plan.scenario, plan.scenario.active);
  const yearsToRetirement = Math.max(0, plan.settings.retirementYear - new Date().getFullYear());

  const toPlan = (amount: number, currency: Holding['instrument']['nativeCurrency']): number =>
    fx.data ? convertChecked(amount, currency, plan.currency, fx.data) : amount;

  const fromPlan = (amount: number, currency: Holding['instrument']['nativeCurrency']): number =>
    fx.data ? convertChecked(amount, plan.currency, currency, fx.data) : amount;

  // Split `spread` equally across every asset (in plan currency), converting each
  // share back into the asset's native currency. Overwrites the current draft.
  const spreadEvenly = () => {
    const n = plan.holdings.length;
    if (n === 0 || spread <= 0) return;
    const perAssetPlan = spread / n;
    setDraft(
      Object.fromEntries(
        plan.holdings.map((h) => [
          h.id,
          Math.round(fromPlan(perAssetPlan, h.instrument.nativeCurrency)),
        ]),
      ),
    );
    setAutomaticDistributionApplied(true);
  };

  // Undo only the automatic distribution and restore the values that were
  // already saved when the modal opened.
  const resetAutomaticDistribution = () => {
    setSpread(0);
    setDraft(Object.fromEntries(plan.holdings.map((h) => [h.id, h.monthlyContribution ?? 0])));
    setAutomaticDistributionApplied(false);
  };

  // Totals in the plan currency: annual cash (no CAGR) vs projected at retirement (with CAGR).
  const totalAnnualNoCagr = plan.holdings.reduce(
    (sum, h) => sum + toPlan((draft[h.id] ?? 0) * 12, h.instrument.nativeCurrency),
    0,
  );
  const totalProjectedWithCagr = plan.holdings.reduce((sum, h) => {
    const effCagr = h.expectedCagrPct + scenarioAdj;
    const fv = contributionFutureValue(draft[h.id] ?? 0, effCagr, yearsToRetirement);
    return sum + toPlan(fv, h.instrument.nativeCurrency);
  }, 0);

  return (
    <Modal
      title={t('savings.title')}
      description={t('savings.desc')}
      onClose={onClose}
      wide
      className="savings-modal"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      {plan.holdings.length > 0 && (
        <div className="contrib-spread-section">
          <div className="contrib-spread-card">
            <div className="contrib-spread">
              <Stepper
                ariaLabel={t('savings.ariaTotalSpread')}
                value={spread}
                min={0}
                step={100}
                suffix={plan.currency}
                onChange={setSpread}
              />
              <div className="contrib-spread__actions">
                <Button
                  className="contrib-spread__button"
                  onClick={spreadEvenly}
                  disabled={spread <= 0}
                >
                  {t('savings.spreadAction')}
                </Button>
                <Button
                  variant="ghost"
                  className="contrib-spread__reset"
                  onClick={resetAutomaticDistribution}
                  disabled={spread <= 0 && !automaticDistributionApplied}
                >
                  {t('savings.resetAutomatic')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {plan.holdings.length === 0 ? (
        <div className="state-box">{t('savings.addAssetsFirst')}</div>
      ) : (
        <div className="contrib-list" role="table" aria-label={t('savings.contributionsTitle')}>
          <div className="contrib-table__header" role="row">
            <span role="columnheader">{t('savings.columnAsset')}</span>
            <span role="columnheader">{t('savings.columnMonthly')}</span>
            <span role="columnheader">{t('savings.columnAnnual')}</span>
            <span role="columnheader">{t('savings.columnProjected')}</span>
          </div>
          <div role="rowgroup">
            {plan.holdings.map((h, i) => (
              <ContributionRow
                key={h.id}
                holding={h}
                index={i}
                value={draft[h.id] ?? 0}
                effectiveCagrPct={h.expectedCagrPct + scenarioAdj}
                yearsToRetirement={yearsToRetirement}
                onChange={(next) => setDraft((d) => ({ ...d, [h.id]: next }))}
              />
            ))}
          </div>
        </div>
      )}

      <div className="contrib-summary">
        <div className="contrib-summary__item">
          <span className="ov__sub">{t('savings.annualShort', { currency: plan.currency })}</span>
          <b>{formatPlain(totalAnnualNoCagr)}</b>
        </div>
        <div className="contrib-summary__item">
          <span className="ov__sub">
            {t('savings.projectedShort', {
              year: plan.settings.retirementYear,
              currency: plan.currency,
            })}
          </span>
          <b>{formatPlain(totalProjectedWithCagr)}</b>
        </div>
      </div>
    </Modal>
  );
};
