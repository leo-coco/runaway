import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { convertOr } from '@/services/currencyService';
import { contributionFutureValue } from '@/services/retirementCalculator';
import { scenarioAdjustmentPts } from '@/domain/scenario';
import type { Holding } from '@/domain/asset';
import type { Plan } from '@/domain/plan';
import { colorForSymbol } from '@/lib/assetColors';

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
  retirementYear,
  onChange,
}: {
  holding: Holding;
  index: number;
  value: number;
  effectiveCagrPct: number;
  yearsToRetirement: number;
  retirementYear: number;
  onChange: (next: number) => void;
}) => {
  const { t } = useTranslation();
  const nativeFmt = useCurrencyFormatter(holding.instrument.nativeCurrency);
  const projected = contributionFutureValue(value, effectiveCagrPct, yearsToRetirement);

  return (
    <div className="contrib-row">
      <div className="asset-id">
        <span
          className="asset-badge"
          style={{ background: colorForSymbol(holding.instrument.symbol, index) }}
        >
          {holding.instrument.symbol.slice(0, 1)}
        </span>
        <div>
          <div className="asset-name">{holding.instrument.name}</div>
          <div className="asset-ticker">
            {t('savings.cagrTicker', {
              symbol: holding.instrument.symbol,
              exchange: holding.instrument.exchange,
              cagr: effectiveCagrPct,
            })}
          </div>
        </div>
      </div>
      <div>
        <Stepper
          ariaLabel={t('savings.ariaMonthly', { symbol: holding.instrument.symbol })}
          value={value}
          min={0}
          step={50}
          suffix={t('savings.perMoSuffix', { currency: holding.instrument.nativeCurrency })}
          onChange={onChange}
        />
        <div className="contrib-values">
          <span className="cagr-note">
            {t('savings.yearlyNoCagr', { amount: nativeFmt.format(value * 12) })}
          </span>
          <span className="cagr-note contrib">
            {t('savings.projectedBy', {
              amount: nativeFmt.compact(projected),
              year: retirementYear,
            })}
          </span>
        </div>
      </div>
    </div>
  );
};

export const SavingsCapacityModal = ({ plan, onSave, onClose }: Props) => {
  const { t } = useTranslation();
  const planFmt = useCurrencyFormatter(plan.currency);
  const fx = useExchangeRate(plan.currency);
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(plan.holdings.map((h) => [h.id, h.monthlyContribution ?? 0])),
  );
  // A lump monthly amount (plan currency) the user can split equally across assets.
  const [spread, setSpread] = useState(0);

  const scenarioAdj = scenarioAdjustmentPts(plan.scenario, plan.scenario.active);
  const yearsToRetirement = Math.max(0, plan.settings.retirementYear - new Date().getFullYear());

  const toPlan = (amount: number, currency: Holding['instrument']['nativeCurrency']): number =>
    fx.data ? convertOr(amount, currency, plan.currency, fx.data) : amount;

  const fromPlan = (amount: number, currency: Holding['instrument']['nativeCurrency']): number =>
    fx.data ? convertOr(amount, plan.currency, currency, fx.data) : amount;

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
        <>
          <div className="eyebrow">{t('savings.spreadTitle')}</div>
          <div className="contrib-spread">
            <Stepper
              ariaLabel={t('savings.ariaTotalSpread')}
              value={spread}
              min={0}
              step={100}
              suffix={t('savings.perMoSuffix', { currency: plan.currency })}
              onChange={setSpread}
            />
            <Button onClick={spreadEvenly} disabled={spread <= 0}>
              {t('savings.spreadButton', { count: plan.holdings.length })}
            </Button>
            <span className="cagr-note">
              {t('savings.spreadEach', {
                amount: planFmt.format(spread / plan.holdings.length),
              })}
            </span>
          </div>
          <div className="divider" />
        </>
      )}

      <div className="eyebrow">{t('savings.perAssetTitle')}</div>

      {plan.holdings.length === 0 ? (
        <div className="state-box">{t('savings.addAssetsFirst')}</div>
      ) : (
        <div className="contrib-list">
          {plan.holdings.map((h, i) => (
            <ContributionRow
              key={h.id}
              holding={h}
              index={i}
              value={draft[h.id] ?? 0}
              effectiveCagrPct={h.expectedCagrPct + scenarioAdj}
              yearsToRetirement={yearsToRetirement}
              retirementYear={plan.settings.retirementYear}
              onChange={(next) => setDraft((d) => ({ ...d, [h.id]: next }))}
            />
          ))}
        </div>
      )}

      <div className="divider" />

      <div className="contrib-summary">
        <div>
          <span className="ov__sub">{t('savings.annualNoCagr')}</span>
          <b>{t('savings.perYr', { amount: planFmt.format(totalAnnualNoCagr) })}</b>
        </div>
        <div>
          <span className="ov__sub">
            {t('savings.projectedAt', { year: plan.settings.retirementYear })}
          </span>
          <b className="contrib">{planFmt.format(totalProjectedWithCagr)}</b>
        </div>
        <div>
          <span className="ov__sub">{t('savings.yearsToRetirement')}</span>
          <b>{yearsToRetirement}</b>
        </div>
      </div>
    </Modal>
  );
};
