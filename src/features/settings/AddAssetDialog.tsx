import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { Toggle } from '@/components/ui/Toggle';
import { Spinner } from '@/components/ui/Spinner';
import { InlineError } from '@/components/InlineError';
import { SearchIcon } from '@/components/icons';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAssetSearch } from '@/hooks/useAssetSearch';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useSearchPrices, type LivePrice } from '@/hooks/useSearchPrices';
import { useServices } from '@/providers/ServicesContext';
import { parseInstrumentId } from '@/services/instrumentRef';
import { matchPseudoAssets } from '@/domain/pseudoAssets';
import { colorForSymbol } from '@/lib/assetColors';
import { newId } from '@/lib/id';
import { MASTER_CURRENCIES, type CurrencyCode } from '@/domain/money';
import type { Instrument, Holding } from '@/domain/asset';
import type { Plan } from '@/domain/plan';
import type { AppError } from '@/domain/errors';
import { cn } from '@/lib/cn';

interface Props {
  plan: Plan;
  onAdd: (holding: Holding) => void;
  onClose: () => void;
}

type Mode = 'search' | 'custom';

const customSymbol = (name: string): string =>
  name.trim().toUpperCase().replace(/\s+/g, '').slice(0, 8) || 'CUSTOM';

/** A single search result with its live price (price formatted in its own currency). */
const SearchResultRow = ({
  instrument,
  index,
  price,
  active,
  onSelect,
}: {
  instrument: Instrument;
  index: number;
  price: LivePrice | undefined;
  active: boolean;
  onSelect: () => void;
}) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(instrument.nativeCurrency);
  return (
    <div
      className={cn('search-row', active && 'active')}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
    >
      <div className="search-row__id">
        <span
          className="asset-badge"
          style={{ background: colorForSymbol(instrument.symbol, index) }}
        >
          {instrument.symbol.slice(0, 1)}
        </span>
        <div className="search-row__main">
          <span className="search-row__sym">{instrument.name}</span>
          <span className="search-row__name">
            {instrument.symbol} · {instrument.exchange}
          </span>
        </div>
      </div>
      {instrument.assetClass === 'crypto' && (
        <div className="search-row__price">
          {price?.status === 'success' && price.value !== undefined ? (
            <span className="search-row__amount">{fmt.price(price.value)}</span>
          ) : price?.status === 'loading' ? (
            <span className="search-row__amount muted">
              <Spinner />
            </span>
          ) : (
            <span className="search-row__amount muted">—</span>
          )}
          <span className="search-row__live">{t('addAsset.livePrice')}</span>
        </div>
      )}
    </div>
  );
};

export const AddAssetDialog = ({ plan, onAdd, onClose }: Props) => {
  const { t } = useTranslation();
  const services = useServices();
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 350);
  const search = useAssetSearch(debounced);

  const results = useMemo(() => search.data ?? [], [search.data]);
  const prices = useSearchPrices(results);

  const pseudoMatches = useMemo<Instrument[]>(
    () =>
      matchPseudoAssets(debounced).map((spec) => ({
        id: spec.id,
        symbol: spec.symbol,
        name: t(spec.nameKey),
        assetClass: spec.assetClass,
        exchange: 'Custom',
        nativeCurrency: plan.currency,
      })),
    [debounced, plan.currency, t],
  );

  const { stocks, crypto } = useMemo(() => {
    const s: Instrument[] = [];
    const c: Instrument[] = [];
    for (const inst of results) {
      if (inst.assetClass === 'crypto') c.push(inst);
      else s.push(inst);
    }
    return { stocks: s, crypto: c };
  }, [results]);

  // Shared fields (quantity + CAGR are used by both modes).
  const [quantity, setQuantity] = useState(1);
  const [cagr, setCagr] = useState(8);

  // Search-selection state.
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<AppError | null>(null);

  const [customName, setCustomName] = useState('');
  const [customCurrency, setCustomCurrency] = useState<CurrencyCode>(plan.currency);
  const [customPrice, setCustomPrice] = useState(0);
  const [customAssetClass, setCustomAssetClass] = useState<'other' | 'cash'>('other');
  // Illiquid custom assets (a home, a car…) should not be drawn down for spending.
  const [customDrawable, setCustomDrawable] = useState(true);

  const nativeFmt = useCurrencyFormatter(selected?.nativeCurrency ?? plan.currency);

  const selectInstrument = async (instrument: Instrument) => {
    setSelected(instrument);
    setPriceError(null);

    // Reuse the live price already fetched for the list when available.
    const known = prices.get(instrument.id);
    if (known?.status === 'success' && known.value !== undefined) {
      setPrice(known.value);
      setPriceLoading(false);
      return;
    }

    setPrice(null);
    setPriceLoading(true);
    const ref = parseInstrumentId(instrument.id);
    if (!ref) {
      // Local pseudo-asset (cash, house, GIC…): no live price to fetch, default to 1.
      setPrice(1);
      setPriceLoading(false);
      return;
    }
    const result =
      ref.provider === 'coingecko'
        ? await services.price.cryptoPrice(ref.ref, instrument.nativeCurrency)
        : await services.price.stockPrice(ref.ref);
    setPriceLoading(false);
    if (result.ok) setPrice(result.value);
    else setPriceError(result.error);
  };

  const handleAdd = () => {
    if (!selected) return;
    onAdd({
      id: newId(),
      instrument: selected,
      quantity,
      pricePerUnit: price ?? 0,
      expectedCagrPct: cagr,
      monthlyContribution: 0,
      accountId: null,
    });
    onClose();
  };

  const canAddCustom = customName.trim().length > 0 && customPrice >= 0 && quantity > 0;

  const handleAddCustom = () => {
    if (!canAddCustom) return;
    onAdd({
      id: newId(),
      instrument: {
        id: `custom:${newId()}`,
        symbol: customSymbol(customName),
        name: customName.trim(),
        assetClass: customAssetClass,
        exchange: 'Custom',
        nativeCurrency: customCurrency,
      },
      quantity,
      pricePerUnit: customPrice,
      expectedCagrPct: cagr,
      monthlyContribution: 0,
      accountId: null,
      drawable: customDrawable ? undefined : false,
    });
    onClose();
  };

  const renderRow = (inst: Instrument, index: number) => (
    <SearchResultRow
      key={inst.id}
      instrument={inst}
      index={index}
      price={prices.get(inst.id)}
      active={selected?.id === inst.id}
      onSelect={() => void selectInstrument(inst)}
    />
  );

  return (
    <Modal
      title={t('addAsset.title')}
      description={t('addAsset.desc')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {mode === 'custom' ? (
            <Button variant="primary" onClick={handleAddCustom} disabled={!canAddCustom}>
              {t('addAsset.add')}
            </Button>
          ) : (
            <Button variant="primary" onClick={handleAdd} disabled={!selected}>
              {t('addAsset.add')}
            </Button>
          )}
        </>
      }
    >
      <div className="addasset-tabs" data-tour="addasset-tabs">
        <button
          type="button"
          className={cn('addasset-tab', mode === 'search' && 'active')}
          onClick={() => setMode('search')}
        >
          {t('addAsset.tabSearch')}
        </button>
        <button
          type="button"
          className={cn('addasset-tab', mode === 'custom' && 'active')}
          onClick={() => setMode('custom')}
        >
          {t('addAsset.tabCustom')}
        </button>
      </div>

      {mode === 'custom' ? (
        <>
          <p className="field__hint" style={{ marginTop: 0, marginBottom: 16 }}>
            {t('addAsset.customHint')}
          </p>
          <div className="field">
            <span className="field__label">{t('addAsset.name')}</span>
            <input
              className="search-input"
              placeholder={t('addAsset.namePlaceholder')}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <span className="field__label">{t('addAsset.assetType')}</span>
            <select
              className="select"
              aria-label={t('addAsset.assetType')}
              value={customAssetClass}
              onChange={(e) => setCustomAssetClass(e.target.value as 'other' | 'cash')}
            >
              <option value="other">{t('addAsset.assetTypeOther')}</option>
              <option value="cash">{t('addAsset.assetTypeCash')}</option>
            </select>
            {customAssetClass === 'cash' && (
              <p className="field__hint" style={{ marginTop: 4 }}>
                {t('addAsset.assetTypeCashHint')}
              </p>
            )}
            <label className="flow-inflation__toggle" style={{ marginTop: 8 }}>
              <Toggle
                checked={customDrawable}
                onChange={setCustomDrawable}
                label={t('addAsset.drawableLabel')}
              />
              <span className="ov__sub">{t('addAsset.drawableLabel')}</span>
            </label>
            {!customDrawable && (
              <p className="field__hint" style={{ marginTop: 4 }}>
                {t('addAsset.drawableHint')}
              </p>
            )}
          </div>
          <div className="adj-grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
            <div className="field">
              <span className="field__label">{t('addAsset.price')}</span>
              <div className="price-cell">
                <Stepper
                  ariaLabel={t('addAsset.ariaPrice')}
                  min={0}
                  step={customPrice >= 1000 ? 100 : 1}
                  suffix={customCurrency}
                  hideButtons
                  value={customPrice}
                  onChange={setCustomPrice}
                />
                <select
                  className="select"
                  aria-label={t('addAsset.ariaCurrency')}
                  value={customCurrency}
                  onChange={(e) => setCustomCurrency(e.target.value as CurrencyCode)}
                >
                  {MASTER_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <span className="field__label">{t('addAsset.quantity')}</span>
              <Stepper
                ariaLabel={t('addAsset.quantity')}
                min={0}
                step={1}
                value={quantity}
                onChange={setQuantity}
              />
            </div>
          </div>
          <div className="field">
            <span className="field__label">{t('addAsset.expectedCagr')}</span>
            <Stepper
              ariaLabel={t('addAsset.ariaCagr')}
              step={1}
              suffix="%"
              hideButtons
              compact
              value={cagr}
              onChange={setCagr}
            />
          </div>
        </>
      ) : (
        <>
          <div className="field" style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-dim)' }}>
                <SearchIcon size={16} />
              </span>
              <input
                className="search-input"
                style={{ paddingLeft: 36 }}
                placeholder={t('addAsset.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>

            {search.isError && <InlineError error={search.error} />}

            {debounced.trim().length >= 2 && (
              <div className="search-results">
                {pseudoMatches.length > 0 && (
                  <>
                    <div className="search-group">{t('addAsset.groupOther')}</div>
                    {pseudoMatches.map((inst, i) => renderRow(inst, i))}
                  </>
                )}
                {search.isLoading ? (
                  <div className="state-box">
                    <Spinner /> {t('addAsset.searching')}
                  </div>
                ) : results.length === 0 && pseudoMatches.length === 0 ? (
                  <div className="state-box">{t('addAsset.noMatches')}</div>
                ) : (
                  <>
                    {stocks.length > 0 && (
                      <>
                        <div className="search-group">{t('addAsset.groupStocks')}</div>
                        {stocks.map((inst, i) => renderRow(inst, i))}
                      </>
                    )}
                    {crypto.length > 0 && (
                      <>
                        <div className="search-group">{t('addAsset.groupCrypto')}</div>
                        {crypto.map((inst, i) => renderRow(inst, stocks.length + i))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {selected && (
            <>
              <div className="divider" />
              <div style={{ marginBottom: 14 }}>
                <strong>{selected.name}</strong>{' '}
                <span className="asset-ticker">
                  {selected.symbol} · {selected.exchange}
                </span>
              </div>

              <div className="field">
                <span className="field__label">
                  {t('addAsset.latestPrice', { currency: selected.nativeCurrency })}
                </span>
                {priceLoading ? (
                  <span className="fetch-link">
                    <Spinner /> {t('addAsset.fetching')}
                  </span>
                ) : priceError ? (
                  <InlineError error={priceError} />
                ) : price !== null ? (
                  <div className="stepper" aria-readonly>
                    <input
                      value={nativeFmt.price(price)}
                      readOnly
                      aria-label={t('addAsset.ariaLatestPrice')}
                    />
                  </div>
                ) : (
                  <p className="field__hint">{t('addAsset.priceUnavailable')}</p>
                )}
              </div>

              <div className="adj-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="field">
                  <span className="field__label">{t('addAsset.quantityHeld')}</span>
                  <Stepper
                    ariaLabel={t('addAsset.quantity')}
                    min={0}
                    step={1}
                    value={quantity}
                    onChange={setQuantity}
                  />
                </div>
                <div className="field">
                  <span className="field__label">{t('addAsset.expectedCagr')}</span>
                  <Stepper
                    ariaLabel={t('addAsset.ariaCagr')}
                    step={1}
                    suffix="%"
                    value={cagr}
                    onChange={setCagr}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
};
