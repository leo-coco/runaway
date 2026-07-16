import { useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PlusIcon, RefreshIcon } from '@/components/icons';
import { Spinner } from '@/components/ui/Spinner';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { usePriceFetcher } from '@/hooks/usePriceFetcher';
import { useAppStore } from '@/store';
import { useLimit } from '@/hooks/useEntitlements';
import { useSession } from '@/lib/authClient';
import { atLimit } from '@/domain/entitlements';
import { languageFromPathname } from '@/i18n';
import { useAppMode } from '@/providers/AppModeContext';
import { accountEffectiveRate, type Account } from '@/domain/account';
import { gainForHoldings, valueHoldings, type GainSummary } from '@/services/portfolioService';
import type { HoldingValue } from '@/services/portfolioService';
import { cn } from '@/lib/cn';
import { AssetRow } from './AssetRow';
import { GainLine } from './GainLine';
import type { Holding } from '@/domain/asset';
import type { Plan } from '@/domain/plan';
import type { RatesTable } from '@/services/currencyService';

interface InvestmentBreakdownProps {
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

export const InvestmentBreakdown = ({ plan, totalValue, rates }: InvestmentBreakdownProps) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const { sandbox } = useAppMode();
  const { data: sessionData } = useSession();
  const updateHolding = useAppStore((s) => s.updateHolding);
  const removeHolding = useAppStore((s) => s.removeHolding);
  const openModal = useAppStore((s) => s.openModal);
  const openPaywall = useAppStore((s) => s.openPaywall);
  const maxAssets = useLimit('maxAssets');
  const { statuses, isFetchingAll, fetchAll } = usePriceFetcher(plan.id);
  const lang = languageFromPathname(window.location.pathname) ?? 'en';
  const sandboxAccountHref = sessionData?.user ? `/${lang}/app` : `/${lang}/app/signup`;

  // Free tier caps assets; adding past the cap opens the paywall instead.
  const onAddAsset = () =>
    atLimit(plan.holdings.length, maxAssets) ? openPaywall('assets') : openModal('addAsset');

  // Read-only by default; clicking a row's edit icon turns that row's cells
  // into inputs. Only one row is editable at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const toggleEditing = (holdingId: string) =>
    setEditingId((cur) => (cur === holdingId ? null : holdingId));

  // Drag-and-drop: move an asset to another account by dragging its handle.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const onZoneOver = (key: string) => (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(key);
  };
  const onZoneLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverKey(null);
  };
  const onZoneDrop = (accountId: string | null) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    if (id) updateHolding(plan.id, id, { accountId });
    setDragOverKey(null);
    setDraggingId(null);
  };

  // Every holding valued in the plan currency (shared by the groups and the total).
  const allValues = useMemo<readonly HoldingValue[]>(
    () => valueHoldings(plan.holdings, plan.currency, rates),
    [plan.holdings, plan.currency, rates],
  );

  // Group holdings into account sections (accounts in order, then Unassigned),
  // each carrying its own value subtotal and unrealised gain/loss.
  const groups = useMemo<Group[]>(() => {
    const valueById = new Map(allValues.map((v) => [v.holdingId, v]));
    const isKnown = (id: string | null): boolean => plan.accounts.some((a) => a.id === id);
    const build = (key: string, account: Account | null, holdings: readonly Holding[]): Group => {
      const vals = holdings
        .map((h) => valueById.get(h.id))
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
    const unassignedHoldings = plan.holdings.filter((h) => !isKnown(h.accountId));
    const result = accountGroups.filter((g) => g.holdings.length > 0);
    if (unassignedHoldings.length > 0) {
      result.push(build('__unassigned__', null, unassignedHoldings));
    }
    return result;
  }, [allValues, plan.holdings, plan.accounts]);

  const totalGain = useMemo(
    () => gainForHoldings(allValues, plan.accounts),
    [allValues, plan.accounts],
  );

  let rowIndex = 0;

  return (
    <div className="section">
      <div className="section__head">
        <div>
          <h2 className="section__title">{t('portfolio.title')}</h2>
          <p className="section__desc">{t('portfolio.desc')}</p>
        </div>
      </div>

      <div className="action-banner portfolio-actions">
        {!sandbox && (
          <Button
            data-tour="fetch-prices-btn"
            onClick={() => fetchAll(plan.holdings)}
            disabled={isFetchingAll}
          >
            {isFetchingAll ? <Spinner /> : <RefreshIcon size={15} />} {t('portfolio.fetchPrices')}
          </Button>
        )}
        {sandbox ? (
          <a className="btn btn--accent action-banner__push-right" href={sandboxAccountHref}>
            <PlusIcon />
            {sessionData?.user
              ? t('portfolio.customizeInAccount')
              : t('portfolio.createAccountToCustomize')}
          </a>
        ) : (
          <Button variant="accent" data-tour="addasset-btn" onClick={onAddAsset}>
            <PlusIcon /> {t('portfolio.addAsset')}
          </Button>
        )}
      </div>

      <Card className="breakdown">
        <div className="brow brow--head">
          <span>{t('portfolio.colAsset')}</span>
          <span>{t('portfolio.colPrice')}</span>
          <span>{t('portfolio.colConverted', { currency: plan.currency })}</span>
          <span>{t('portfolio.colCostBasis')}</span>
          <span>{t('portfolio.colQuantity')}</span>
          <span>{t('portfolio.colValue')}</span>
          <span>{t('portfolio.colRoi')}</span>
          <span>{t('portfolio.colCagr')}</span>
          <span>{t('portfolio.colActions')}</span>
        </div>

        {plan.holdings.length === 0 ? (
          <div className="state-box">{t('portfolio.empty')}</div>
        ) : (
          groups.map((g) => {
            const targetId = g.account ? g.account.id : null;
            const name = g.account ? g.account.name : t('portfolio.unassigned');
            const isOver = dragOverKey === g.key;
            return (
              <div
                className={cn('acct-group', draggingId && 'is-droppable', isOver && 'is-drop-over')}
                key={g.key}
                onDragOver={onZoneOver(g.key)}
                onDragLeave={onZoneLeave}
                onDrop={onZoneDrop(targetId)}
              >
                {isOver && <div className="acct-group__hint">{t('common.addTo', { name })}</div>}
                <div className="acct-section">
                  <div className="acct-section__main">
                    <span className="acct-section__name">{name}</span>
                    <span className="acct-section__meta">
                      {t('portfolio.assets', { count: g.holdings.length })}
                      {g.account
                        ? t('portfolio.taxSuffix', {
                            rate: (
                              accountEffectiveRate(g.account, plan.residenceCountry ?? 'US') * 100
                            ).toFixed(1),
                          })
                        : ''}
                    </span>
                  </div>
                  <span className="acct-section__total">{fmt.format(g.subtotal)}</span>
                  <GainLine gain={g.gain} fmt={fmt} className="acct-section__gain" />
                </div>

                {g.holdings.map((h) => (
                  <AssetRow
                    key={h.id}
                    plan={plan}
                    holding={h}
                    index={rowIndex++}
                    editing={editingId === h.id}
                    onToggleEdit={() => toggleEditing(h.id)}
                    rates={rates}
                    fetchState={statuses[h.id]}
                    onUpdate={updateHolding.bind(null, plan.id)}
                    onRemove={removeHolding.bind(null, plan.id)}
                    onDragStart={() => setDraggingId(h.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverKey(null);
                    }}
                  />
                ))}
              </div>
            );
          })
        )}

        {/* While dragging, expose empty accounts (and Unassigned) as drop targets. */}
        {draggingId &&
          (() => {
            const shown = new Set(groups.map((g) => g.key));
            const extras: { key: string; accountId: string | null; name: string }[] = [
              ...plan.accounts
                .filter((a) => !shown.has(a.id))
                .map((a) => ({ key: a.id, accountId: a.id, name: a.name })),
              ...(shown.has('__unassigned__')
                ? []
                : [{ key: '__unassigned__', accountId: null, name: t('portfolio.unassigned') }]),
            ];
            return extras.map((zone) => (
              <div
                key={zone.key}
                className={cn('acct-dropzone', dragOverKey === zone.key && 'is-drop-over')}
                onDragOver={onZoneOver(zone.key)}
                onDragLeave={onZoneLeave}
                onDrop={onZoneDrop(zone.accountId)}
              >
                {t('common.addTo', { name: zone.name })}
              </div>
            ));
          })()}

        {plan.holdings.length > 0 && (
          <div className="total-row">
            <span className="label">Total ({plan.currency})</span>
            <GainLine gain={totalGain} fmt={fmt} />
            <span className="value">{fmt.format(totalValue)}</span>
          </div>
        )}
      </Card>
    </div>
  );
};
