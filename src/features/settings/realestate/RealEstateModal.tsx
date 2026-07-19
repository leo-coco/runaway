import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { PlusIcon, PencilIcon, HomeIcon, BuildingIcon, ChevronRightIcon } from '@/components/icons';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import { homeEquitySeries, homeFlows, isOpenEndedYear, HOME_FLOW_LABEL_KEY } from '@/domain/home';
import {
  rentalPropertyEquitySeries,
  rentalPropertiesEquitySeries,
  rentalPropertiesFlows,
  rentalMonthlyNetCashflow,
  rentalPropertiesMonthlyNetCashflow,
  rentalFlowLabelKey,
} from '@/domain/rentalProperty';
import type { ExpenseIncome } from '@/domain/expenseIncome';
import type { Plan } from '@/domain/plan';
import { cn } from '@/lib/cn';
import { PropertyDialog, type PropertyDialogTarget } from './PropertyDialog';

interface Props {
  plan: Plan;
  onClose: () => void;
}

/**
 * The unified "Immobilier" surface (premium): primary residence and rental
 * properties in one modal. Shows combined equity (today / at retirement) and net
 * rental cashflow, the list of properties grouped by type, and every generated
 * real-estate flow. Add/edit routes through the shared {@link PropertyDialog};
 * the domain logic for homes and rentals stays separate.
 */
export const RealEstateModal = ({ plan, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const [target, setTarget] = useState<PropertyDialogTarget | null>(null);

  const startYear = new Date().getFullYear();
  const retirementYear = plan.settings.retirementYear;
  const inflationPct = plan.settings.inflationPct;
  const maxYear = lifeExpectancyYear(
    plan.settings.currentAge,
    startYear,
    plan.settings.lifeExpectancyAge,
  );
  const horizonYears = Math.max(1, maxYear - startYear);

  const home = plan.home;
  const properties = plan.properties ?? [];

  const atRetire = <T extends { year: number }>(series: readonly T[]): T | undefined =>
    series.find((e) => e.year === retirementYear) ?? series[series.length - 1];

  const homeEquity = home ? homeEquitySeries(home, startYear, horizonYears) : [];
  const rentalEquity = rentalPropertiesEquitySeries(properties, startYear, horizonYears);

  const equityNow = (homeEquity[0]?.equity ?? 0) + (rentalEquity[0]?.equity ?? 0);
  const equityAtRetire =
    (home ? (atRetire(homeEquity)?.equity ?? 0) : 0) + (atRetire(rentalEquity)?.equity ?? 0);
  const netCashflow = rentalPropertiesMonthlyNetCashflow(properties, startYear, inflationPct);

  // Aggregated flows: home first, then every rental, tagged with the property
  // name and labelled from each domain's own label map.
  const flows: readonly ExpenseIncome[] = [
    ...homeFlows(home, startYear),
    ...rentalPropertiesFlows(properties, startYear, inflationPct),
  ];

  const flowLabel = (id: string): string => {
    if (HOME_FLOW_LABEL_KEY[id]) return t(HOME_FLOW_LABEL_KEY[id]!);
    const key = rentalFlowLabelKey(id);
    return key ? t(key) : id;
  };

  // Net over the flow's whole life, in today's-money magnitudes (the figures the
  // detail rows show): one-offs signed as-is, recurring flows times their span.
  const flowLifetimeNet = (f: ExpenseIncome): number => {
    const span =
      f.frequency === 'recurring'
        ? Math.max(1, Math.min(f.endYear ?? f.year, maxYear) - f.year + 1)
        : 1;
    return (f.kind === 'income' ? 1 : -1) * f.amount * span;
  };

  // Group flows by property, preserving first-seen order (home first, then rentals).
  const flowGroups = (() => {
    const order: string[] = [];
    const byName = new Map<string, ExpenseIncome[]>();
    for (const f of flows) {
      if (!byName.has(f.name)) {
        byName.set(f.name, []);
        order.push(f.name);
      }
      byName.get(f.name)!.push(f);
    }
    return order.map((name) => {
      const items = byName.get(name)!;
      return { name, items, net: items.reduce((s, f) => s + flowLifetimeNet(f), 0) };
    });
  })();

  // A property bought after the plan starts owns nothing today — its equity is 0
  // until its purchase year (see homeEquitySeries / rentalPropertyEquitySeries).
  const homePurchaseYear =
    home?.purchase && home.purchase.year > startYear ? home.purchase.year : null;
  const futurePurchaseYear = (year: number | undefined): number | null =>
    year !== undefined && year > startYear ? year : null;

  const rentalCountBadge = t('realEstate.countBadge', { count: properties.length });
  const homeCountBadge = t('realEstate.countBadge', { count: home ? 1 : 0 });

  return (
    <>
      <Modal
        title={t('realEstate.title')}
        description={t('realEstate.desc')}
        onClose={onClose}
        wide
        className="realestate-modal"
        headerActions={
          <Button variant="accent" onClick={() => setTarget({ mode: 'new' })}>
            <PlusIcon size={15} /> {t('realEstate.addProperty')}
          </Button>
        }
        footer={
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        }
      >
        <div className="realestate-content">
          {/* Summary tiles */}
          <div className="contrib-summary contrib-summary--triple">
            <div className="contrib-summary__item">
              <span className="ov__sub realestate-tile-label">
                {t('realEstate.equityNow')}
                <Tooltip text={t('realEstate.equityNowTip')} />
              </span>
              <b>{fmt.compact(equityNow)}</b>
              <span className="ov__sub">{t('realEstate.equityNowSub')}</span>
            </div>
            <div className="contrib-summary__item">
              <span className="ov__sub">{t('realEstate.equityAt')}</span>
              <b>{fmt.compact(equityAtRetire)}</b>
              <span className="ov__sub">
                {t('realEstate.equityAtSub', { year: retirementYear })}
              </span>
            </div>
            <div className="contrib-summary__item">
              <span className="ov__sub">{t('realEstate.netCashflow')}</span>
              <b className={netCashflow < 0 ? 'is-neg' : 'is-pos'}>
                {netCashflow < 0 ? '' : '+'}
                {fmt.compact(netCashflow)}
                {t('common.perMonth')}
              </b>
              <span className="ov__sub">{t('realEstate.netCashflowSub')}</span>
            </div>
          </div>

          {/* Properties, grouped by type */}
          <section className="realestate-section">
            <div className="realestate-section__head">
              <h3 className="realestate-section__title">{t('realEstate.assetsTitle')}</h3>
              <p className="realestate-section__sub">{t('realEstate.assetsSub')}</p>
            </div>

            <div className="realestate-group">
              <div className="realestate-group__head">
                <span className="realestate-group__title">{t('realEstate.residenceHeading')}</span>
                <span className="realestate-badge">{homeCountBadge}</span>
              </div>
              {home ? (
                <div className="realestate-list">
                  <div className="realestate-row">
                    <span className="realestate-row__icon" aria-hidden="true">
                      <HomeIcon size={18} />
                    </span>
                    <div className="realestate-row__name">
                      <strong>{home.name || t('home.defaultName')}</strong>
                      <span>{t('realEstate.typeHome')}</span>
                      {homePurchaseYear !== null && (
                        <span className="realestate-planned">
                          {t('realEstate.plannedPurchase', { year: homePurchaseYear })}
                        </span>
                      )}
                    </div>
                    <div className="realestate-row__stats">
                      <span className="realestate-stat">
                        <span className="ov__sub">{t('realEstate.colValue')}</span>
                        <b>{fmt.compact(homeEquity[0]?.value ?? 0)}</b>
                      </span>
                      <span className="realestate-stat">
                        <span className="ov__sub">{t('realEstate.colDebt')}</span>
                        <b>{fmt.compact(homeEquity[0]?.mortgageBalance ?? 0)}</b>
                      </span>
                      <span className="realestate-stat">
                        <span className="ov__sub">{t('realEstate.colEquity')}</span>
                        <b>{fmt.compact(homeEquity[0]?.equity ?? 0)}</b>
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="realestate-row__edit"
                      onClick={() => setTarget({ mode: 'edit-home' })}
                    >
                      <PencilIcon size={14} /> {t('common.edit')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="state-box realestate-empty">{t('realEstate.residenceEmpty')}</div>
              )}
            </div>

            <div className="realestate-group">
              <div className="realestate-group__head">
                <span className="realestate-group__title">{t('realEstate.rentalHeading')}</span>
                <span className="realestate-badge">{rentalCountBadge}</span>
              </div>
              {properties.length > 0 ? (
                <div className="realestate-list">
                  {properties.map((p) => {
                    const eq = rentalPropertyEquitySeries(p, startYear, 0)[0];
                    const net = rentalMonthlyNetCashflow(p, startYear, inflationPct);
                    return (
                      <div className="realestate-row" key={p.id}>
                        <span className="realestate-row__icon" aria-hidden="true">
                          <BuildingIcon size={18} />
                        </span>
                        <div className="realestate-row__name">
                          <strong>{p.name || t('rental.defaultName')}</strong>
                          <span>{t('realEstate.typeRental')}</span>
                          {futurePurchaseYear(p.purchase?.year) !== null && (
                            <span className="realestate-planned">
                              {t('realEstate.plannedPurchase', {
                                year: futurePurchaseYear(p.purchase?.year),
                              })}
                            </span>
                          )}
                        </div>
                        <div className="realestate-row__stats">
                          <span className="realestate-stat">
                            <span className="ov__sub">{t('realEstate.colValue')}</span>
                            <b>{fmt.compact(eq?.value ?? 0)}</b>
                          </span>
                          <span className="realestate-stat">
                            <span className="ov__sub">{t('realEstate.colEquity')}</span>
                            <b>{fmt.compact(eq?.equity ?? 0)}</b>
                          </span>
                          <span className="realestate-stat">
                            <span className="ov__sub">{t('realEstate.colNetFlow')}</span>
                            <b className={net < 0 ? 'is-neg' : 'is-pos'}>
                              {net < 0 ? '' : '+'}
                              {fmt.compact(net)}
                              {t('common.perMonth')}
                            </b>
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="realestate-row__edit"
                          onClick={() => setTarget({ mode: 'edit-rental', property: p })}
                        >
                          <PencilIcon size={14} /> {t('common.edit')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="state-box realestate-empty">{t('realEstate.rentalEmpty')}</div>
              )}
            </div>
          </section>

          {/* Aggregated flows */}
          <section className="realestate-section">
            <div className="realestate-section__head realestate-section__head--row">
              <div>
                <h3 className="realestate-section__title">{t('realEstate.flowsTitle')}</h3>
                <p className="realestate-section__sub">{t('realEstate.flowsSub')}</p>
              </div>
              <span className="realestate-badge">{t('realEstate.flowsBadge')}</span>
            </div>

            {flows.length === 0 ? (
              <div className="state-box realestate-empty">{t('realEstate.flowsEmpty')}</div>
            ) : (
              <div className="realestate-flowgroups">
                {flowGroups.map((g) => {
                  const positive = g.net >= 0;
                  return (
                    <details className="realestate-flowgroup" key={g.name}>
                      <summary className="realestate-flowgroup__summary">
                        <span className="realestate-flowgroup__chev" aria-hidden="true">
                          <ChevronRightIcon size={15} />
                        </span>
                        <span className="realestate-flowgroup__name">{g.name}</span>
                        <span className="realestate-flowgroup__label">
                          {t('realEstate.colNetTotal')}
                        </span>
                        <span
                          className={cn(
                            'realestate-flowgroup__total',
                            positive ? 'is-income' : 'is-expense',
                          )}
                        >
                          {positive ? '+' : '-'}
                          {fmt.compact(Math.abs(g.net))}
                        </span>
                      </summary>
                      <div className="realestate-flowgroup__body">
                        {g.items.map((f) => {
                          const isIncome = f.kind === 'income';
                          const recurring = f.frequency === 'recurring';
                          const openEnded =
                            recurring && isOpenEndedYear(f.endYear ?? f.year, startYear);
                          const period =
                            recurring && !openEnded ? `${f.year}–${f.endYear}` : `${f.year}`;
                          const amount = `${isIncome ? '+' : '-'}${fmt.compact(f.amount)}${
                            recurring ? t('common.perYear') : ''
                          }`;
                          return (
                            <div className="realestate-flowrow" key={f.id}>
                              <span className="realestate-flowrow__flow">{flowLabel(f.id)}</span>
                              <span className="realestate-flowrow__period">{period}</span>
                              <span
                                className={cn(
                                  'realestate-flowrow__amount',
                                  isIncome ? 'is-income' : 'is-expense',
                                )}
                              >
                                {amount}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </Modal>

      {target && <PropertyDialog plan={plan} target={target} onClose={() => setTarget(null)} />}
    </>
  );
};
