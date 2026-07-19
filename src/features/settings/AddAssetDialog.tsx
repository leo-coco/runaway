import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { Toggle } from '@/components/ui/Toggle';
import { Spinner } from '@/components/ui/Spinner';
import { InlineError } from '@/components/InlineError';
import { InfoIcon, SearchIcon } from '@/components/icons';
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
import type { Instrument, Holding, AssetAllocation } from '@/domain/asset';
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
  const debounced = useDebouncedValue(query, 500);
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

  const stocksByExchange = useMemo(() => {
    const groups = new Map<string, Instrument[]>();
    for (const inst of stocks) {
      const key = inst.exchange || t('addAsset.groupStocks');
      const group = groups.get(key);
      if (group) group.push(inst);
      else groups.set(key, [inst]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [stocks, t]);

  // Shared fields (quantity + CAGR are used by both modes).
  const [quantity, setQuantity] = useState(1);
  const [cagr, setCagr] = useState(8);

  // Search-selection state.
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<AppError | null>(null);
  // Fund/ETF composition, fetched alongside price but never blocks adding the
  // holding — id-guarded so a slow response can't attach to a later selection.
  const [allocation, setAllocation] = useState<AssetAllocation | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const [customName, setCustomName] = useState('');
  const [customCurrency, setCustomCurrency] = useState<CurrencyCode>(plan.currency);
  const [customPrice, setCustomPrice] = useState(0);
  const [customAssetClass, setCustomAssetClass] = useState<'other' | 'cash'>('other');
  // Illiquid custom assets (a home, a car…) should not be drawn down for spending.
  const [customDrawable, setCustomDrawable] = useState(true);
  const [infoTopic, setInfoTopic] = useState<'type' | 'drawable' | null>(null);

  const nativeFmt = useCurrencyFormatter(selected?.nativeCurrency ?? plan.currency);

  const selectInstrument = async (instrument: Instrument) => {
    setSelected(instrument);
    setPriceError(null);
    setAllocation(null);
    selectedIdRef.current = instrument.id;

    if (instrument.quoteType === 'ETF' || instrument.quoteType === 'MUTUALFUND') {
      // Fire-and-forget: supplementary metadata, must never block adding the asset.
      void services.price.allocation(instrument.symbol).then((result) => {
        if (selectedIdRef.current === instrument.id && result.ok) setAllocation(result.value);
      });
    }

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
      instrument: allocation ? { ...selected, assetAllocation: allocation } : selected,
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
      onClose={infoTopic ? () => setInfoTopic(null) : onClose}
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
      <div
        className="seg-tabs"
        data-tour="addasset-tabs"
        role="tablist"
        aria-label={t('addAsset.title')}
      >
        <button
          type="button"
          className={cn('seg-tab', mode === 'search' && 'is-active')}
          onClick={() => setMode('search')}
        >
          {t('addAsset.tabSearch')}
        </button>
        <button
          type="button"
          className={cn('seg-tab', mode === 'custom' && 'is-active')}
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
            <span className="field__label field__label-row">
              {t('addAsset.assetType')}
              <button
                type="button"
                className="acct-info-btn"
                aria-label={t('addAsset.typeInfoAria')}
                aria-expanded={infoTopic === 'type'}
                onClick={() => setInfoTopic(infoTopic === 'type' ? null : 'type')}
              >
                <InfoIcon size={13} />
              </button>
            </span>
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
          </div>
          <div className="field">
            <label className="flow-inflation__toggle">
              <Toggle
                checked={customDrawable}
                onChange={setCustomDrawable}
                label={t('addAsset.drawableLabel')}
              />
              <span className="ov__sub">{t('addAsset.drawableLabel')}</span>
              <button
                type="button"
                className="acct-info-btn"
                aria-label={t('addAsset.drawableInfoAria')}
                aria-expanded={infoTopic === 'drawable'}
                onClick={(e) => {
                  e.preventDefault();
                  setInfoTopic(infoTopic === 'drawable' ? null : 'drawable');
                }}
              >
                <InfoIcon size={13} />
              </button>
            </label>
            {!customDrawable && (
              <p className="field__hint" style={{ marginTop: 4 }}>
                {t('addAsset.drawableHint')}
              </p>
            )}
          </div>
          <div className="addasset-fields">
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
            <div className="field">
              <span className="field__label">{t('addAsset.expectedCagr')}</span>
              <Stepper
                ariaLabel={t('addAsset.ariaCagr')}
                step={1}
                suffix="%"
                hideButtons
                value={cagr}
                onChange={setCagr}
              />
            </div>
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
                    {stocksByExchange.map(([exchange, insts]) => (
                      <div key={exchange}>
                        <div className="search-group">{exchange}</div>
                        {insts.map((inst, i) => renderRow(inst, i))}
                      </div>
                    ))}
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

              <div className="addasset-fields addasset-fields--2">
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

      {infoTopic === 'type' && (
        <Modal
          title={t('addAsset.typeInfoTitle')}
          description={t('addAsset.typeInfoDesc')}
          onClose={() => setInfoTopic(null)}
          className="asset-info-modal"
          footer={
            <Button variant="primary" onClick={() => setInfoTopic(null)}>
              {t('common.close')}
            </Button>
          }
        >
          <div className="acct-explain">
            <p className="acct-explain__line" style={{ marginTop: 0 }}>
              {t('addAsset.typeInfoIntro')}
            </p>
            <ul className="acct-explain__steps">
              <li>{t('addAsset.typeInfoOther')}</li>
              <li>{t('addAsset.typeInfoCash')}</li>
            </ul>
            <div className="acct-explain__note">{t('addAsset.typeInfoNote')}</div>
          </div>
        </Modal>
      )}

      {infoTopic === 'drawable' && (
        <Modal
          title={t('addAsset.drawableInfoTitle')}
          description={t('addAsset.drawableInfoDesc')}
          onClose={() => setInfoTopic(null)}
          className="asset-info-modal"
          footer={
            <Button variant="primary" onClick={() => setInfoTopic(null)}>
              {t('common.close')}
            </Button>
          }
        >
          <div className="acct-explain">
            <p className="acct-explain__line" style={{ marginTop: 0 }}>
              {t('addAsset.drawableInfoIntro')}
            </p>
            <ul className="acct-explain__steps">
              <li>{t('addAsset.drawableInfoExample1')}</li>
              <li>{t('addAsset.drawableInfoExample2')}</li>
              <li>{t('addAsset.drawableInfoExample3')}</li>
            </ul>
            <p className="acct-explain__line">{t('addAsset.drawableInfoImpactsTitle')}</p>
            <ul className="acct-explain__steps">
              <li>{t('addAsset.drawableInfoImpact1')}</li>
              <li>{t('addAsset.drawableInfoImpact2')}</li>
              <li>{t('addAsset.drawableInfoImpact3')}</li>
              <li>{t('addAsset.drawableInfoImpact4')}</li>
              <li>{t('addAsset.drawableInfoImpact5')}</li>
            </ul>
          </div>
        </Modal>
      )}
    </Modal>
  );
};
