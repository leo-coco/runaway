import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stepper } from '@/components/ui/Stepper';
import { Button } from '@/components/ui/Button';
import { DragHandleIcon, RefreshIcon, TrashIcon } from '@/components/icons';
import { Spinner } from '@/components/ui/Spinner';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { colorForSymbol } from '@/lib/assetColors';
import { holdingNativeValue } from '@/domain/asset';
import { scenarioAdjustmentPts } from '@/domain/scenario';
import { convert, convertOr, type RatesTable } from '@/services/currencyService';
import type { Holding } from '@/domain/asset';
import type { Plan } from '@/domain/plan';
import type { PriceFetchState } from '@/hooks/usePriceFetcher';

const truncate = (text: string, maxLength: number) =>
  text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;

interface AssetRowProps {
  plan: Plan;
  holding: Holding;
  index: number;
  /** When false the editable cells render as plain read-only values. */
  editing: boolean;
  rates: RatesTable | undefined;
  fetchState: PriceFetchState | undefined;
  onFetchPrice: (h: Holding) => void;
  onUpdate: (
    holdingId: string,
    patch: Partial<
      Pick<Holding, 'quantity' | 'pricePerUnit' | 'expectedCagrPct' | 'accountId' | 'costBasis'>
    >,
  ) => void;
  onRemove: (holdingId: string) => void;
  /** Drag-and-drop to another account: fired when this row starts/ends a drag. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export const AssetRow = ({
  plan,
  holding,
  index,
  editing,
  rates,
  fetchState,
  onFetchPrice,
  onUpdate,
  onRemove,
  onDragStart,
  onDragEnd,
}: AssetRowProps) => {
  const { t } = useTranslation();
  const planFmt = useCurrencyFormatter(plan.currency);
  const nativeFmt = useCurrencyFormatter(holding.instrument.nativeCurrency);
  const color = colorForSymbol(holding.instrument.symbol, index);
  // Display the bare ticker without its market suffix (e.g. XEQT.TO -> XEQT,
  // BTC.crypto -> BTC) so the identity column stays compact.
  const displaySymbol = holding.instrument.symbol.replace(/\.[A-Za-z]+$/, '');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const removeRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Close the confirm popover on outside click or Escape.
  useEffect(() => {
    if (!confirmingRemove) return;
    const onDoc = (e: MouseEvent) => {
      if (removeRef.current && !removeRef.current.contains(e.target as Node))
        setConfirmingRemove(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setConfirmingRemove(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirmingRemove]);
  // Origin currency is fixed by the asset's market (set when the asset is added).
  const native = holding.instrument.nativeCurrency;
  const isSameCurrency = native === plan.currency;

  const nativeValue = holdingNativeValue(holding);
  const planValue = rates ? convertOr(nativeValue, native, plan.currency, rates) : nativeValue;

  // Live converted unit price in the plan's master currency.
  const convertedPrice = isSameCurrency
    ? { ok: true as const, value: holding.pricePerUnit }
    : rates
      ? convert(holding.pricePerUnit, native, plan.currency, rates)
      : null;

  const effectiveCagr =
    holding.expectedCagrPct + scenarioAdjustmentPts(plan.scenario, plan.scenario.active);
  const status = fetchState?.status ?? 'idle';

  // Finer steps for low-priced assets so sub-dollar prices stay precise.
  const priceStep = holding.pricePerUnit >= 1000 ? 100 : holding.pricePerUnit >= 1 ? 1 : 0.01;

  // Cost basis PER UNIT (native), parallel to the unit price. Default is the
  // account's static cost-basis share of the unit price until the user sets one.
  const account = plan.accounts.find((a) => a.id === holding.accountId);
  const defaultBasisPerUnit = holding.pricePerUnit * ((account?.costBasisPct ?? 0) / 100);
  const costBasisPerUnit = holding.costBasis ?? defaultBasisPerUnit;
  // Unrealised gain/loss vs cost basis (ROI) — per unit, so quantity-independent.
  const roiPct =
    costBasisPerUnit > 0
      ? ((holding.pricePerUnit - costBasisPerUnit) / costBasisPerUnit) * 100
      : null;
  // Absolute gain/loss in the plan currency (scales with quantity).
  const totalBasisNative = costBasisPerUnit * holding.quantity;
  const totalBasisPlan = rates
    ? convertOr(totalBasisNative, native, plan.currency, rates)
    : totalBasisNative;
  const gainPlan = planValue - totalBasisPlan;

  return (
    <div className="brow" ref={rowRef}>
      <div className="asset-id">
        <span
          className="drag-handle"
          data-tour={index === 0 ? 'drag-handle' : undefined}
          draggable
          role="button"
          tabIndex={0}
          aria-label={t('portfolio.dragAria', { symbol: holding.instrument.symbol })}
          title={t('portfolio.dragTitle')}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', holding.id);
            e.dataTransfer.effectAllowed = 'move';
            if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 16, 16);
            onDragStart?.();
          }}
          onDragEnd={() => onDragEnd?.()}
        >
          <DragHandleIcon size={16} />
        </span>
        <span className="asset-badge" style={{ background: color }}>
          {holding.instrument.symbol.slice(0, 1)}
        </span>
        <div className="asset-id__text" title={`${displaySymbol} ${holding.instrument.name}`}>
          <span className="asset-sym">{displaySymbol}</span>
          <span className="asset-nm">{truncate(holding.instrument.name, 8)}</span>
        </div>
      </div>

      {/* Asset price in its native currency (currency is fixed by the market).
          The live-price refresh stays available in read-only mode; only the
          editable value collapses to plain text. */}
      <div>
        <div className="price-cell">
          {editing ? (
            <Stepper
              ariaLabel={`${holding.instrument.symbol} price`}
              value={holding.pricePerUnit}
              step={priceStep}
              min={0}
              suffix={native}
              hideButtons
              onChange={(v) => onUpdate(holding.id, { pricePerUnit: v })}
            />
          ) : (
            <span className="read-value">{nativeFmt.price(holding.pricePerUnit)}</span>
          )}
          <button
            type="button"
            className={`fetch-btn ${status === 'error' ? 'is-error' : ''} ${
              status === 'success' ? 'is-success' : ''
            }`}
            onClick={() => onFetchPrice(holding)}
            aria-label={t('portfolio.fetchAria', { symbol: holding.instrument.symbol })}
            title={
              status === 'error'
                ? (fetchState?.error?.message ?? t('portfolio.fetchError'))
                : status === 'success'
                  ? t('portfolio.fetchSuccess', {
                      price: nativeFmt.price(holding.pricePerUnit),
                    })
                  : t('portfolio.fetchIdle')
            }
          >
            {status === 'loading' ? <Spinner /> : <RefreshIcon size={14} />}
          </button>
        </div>
        {status === 'error' && (
          <div className="fetch-error" role="alert">
            {fetchState?.error?.message ?? t('portfolio.fetchError')}
          </div>
        )}
      </div>

      {/* Converted unit price (master currency) */}
      <div>
        <div className="converted-price">
          {convertedPrice === null ? (
            <span className="muted">
              <Spinner /> {t('portfolio.rate')}
            </span>
          ) : convertedPrice.ok ? (
            planFmt.price(convertedPrice.value)
          ) : (
            <span className="muted" title={convertedPrice.error.message}>
              rate unavailable
            </span>
          )}
        </div>
        {!isSameCurrency && <div className="cagr-note">{`${native} → ${plan.currency}`}</div>}
      </div>

      {/* Cost basis (native currency) — drives dynamic capital-gains tracking */}
      <div className="narrow-cell">
        {editing ? (
          <Stepper
            ariaLabel={t('portfolio.costBasisAria', { symbol: holding.instrument.symbol })}
            value={costBasisPerUnit}
            step={priceStep}
            min={0}
            suffix={native}
            hideButtons
            onChange={(v) => onUpdate(holding.id, { costBasis: v })}
          />
        ) : (
          <span className="read-value">{nativeFmt.price(costBasisPerUnit)}</span>
        )}
      </div>

      <div className="narrow-cell" data-tour={index === 0 ? 'quantity-input' : undefined}>
        {editing ? (
          <Stepper
            ariaLabel={`${holding.instrument.symbol} quantity`}
            value={holding.quantity}
            step={1}
            min={0}
            hideButtons
            onChange={(v) => onUpdate(holding.id, { quantity: v })}
          />
        ) : (
          <span className="read-value">{holding.quantity}</span>
        )}
      </div>

      {/* Total value of the holding (master currency) */}
      <div>
        <div className="converted-price">
          {rates || isSameCurrency ? (
            <b>{planFmt.price(planValue)}</b>
          ) : (
            <span className="muted">
              <Spinner /> {t('portfolio.rate')}
            </span>
          )}
        </div>
      </div>

      {/* Total return: signed amount + percentage pill (green/red) */}
      <div>
        {roiPct === null ? (
          <span className="muted">—</span>
        ) : (
          <div className={`ret-cell ${gainPlan >= 0 ? 'is-pos' : 'is-neg'}`}>
            <span className="ret-amt">
              {gainPlan >= 0 ? '+' : '−'}
              {planFmt.compact(Math.abs(gainPlan))}
            </span>
            <span className="ret-pill">{Math.abs(roiPct).toFixed(1)}%</span>
          </div>
        )}
      </div>

      <div data-tour={index === 0 ? 'cagr-input' : undefined}>
        {editing ? (
          <>
            <Stepper
              ariaLabel={`${holding.instrument.symbol} expected CAGR`}
              value={holding.expectedCagrPct}
              step={1}
              suffix="%"
              hideButtons
              compact
              onChange={(v) => onUpdate(holding.id, { expectedCagrPct: v })}
            />
            <div className="cagr-note">
              {t('portfolio.appliedCagr')} <b>{effectiveCagr}%</b>
            </div>
          </>
        ) : (
          <span className="read-value">{effectiveCagr}%</span>
        )}
      </div>

      {editing && (
        <div className="asset-row__remove" ref={removeRef}>
          <Button
            variant="danger"
            size="sm"
            aria-label={t('portfolio.removeAria', { symbol: holding.instrument.symbol })}
            aria-haspopup="dialog"
            aria-expanded={confirmingRemove}
            onClick={() => setConfirmingRemove((v) => !v)}
          >
            <TrashIcon size={16} />
          </Button>
          {confirmingRemove && (
            <div className="asset-row__confirm" role="dialog" aria-label="Confirm removal">
              <span className="asset-row__confirm-text">{t('common.removeQuestion')}</span>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setConfirmingRemove(false);
                  onRemove(holding.id);
                }}
              >
                {t('common.remove')}
              </Button>
              <Button size="sm" onClick={() => setConfirmingRemove(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
