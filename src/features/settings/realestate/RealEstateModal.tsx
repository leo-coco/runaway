import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PlusIcon, PencilIcon, HomeIcon, BuildingIcon } from '@/components/icons';
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
              <span className="ov__sub">{t('realEstate.equityNow')}</span>
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
              <div
                className="realestate-flowtable"
                role="table"
                aria-label={t('realEstate.flowsTitle')}
              >
                <div className="realestate-flowtable__header" role="row">
                  <span role="columnheader">{t('realEstate.colProperty')}</span>
                  <span role="columnheader">{t('realEstate.colFlow')}</span>
                  <span role="columnheader">{t('realEstate.colPeriod')}</span>
                  <span role="columnheader" className="realestate-flowtable__amount-head">
                    {t('realEstate.colAmount')}
                  </span>
                </div>
                <div role="rowgroup">
                  {flows.map((f) => {
                    const isIncome = f.kind === 'income';
                    const recurring = f.frequency === 'recurring';
                    const openEnded = recurring && isOpenEndedYear(f.endYear ?? f.year, startYear);
                    const period = recurring && !openEnded ? `${f.year}–${f.endYear}` : `${f.year}`;
                    const amount = `${isIncome ? '+' : '-'}${fmt.compact(f.amount)}${
                      recurring ? t('common.perYear') : ''
                    }`;
                    return (
                      <div className="realestate-flowtable__row" role="row" key={f.id}>
                        <span className="realestate-flowtable__property" role="cell">
                          {f.name}
                        </span>
                        <span className="realestate-flowtable__flow" role="cell">
                          {flowLabel(f.id)}
                        </span>
                        <span
                          className="realestate-flowtable__period"
                          role="cell"
                          data-label={t('realEstate.colPeriod')}
                        >
                          {period}
                        </span>
                        <span
                          className={cn(
                            'realestate-flowtable__amount',
                            isIncome ? 'is-income' : 'is-expense',
                          )}
                          role="cell"
                          data-label={t('realEstate.colAmount')}
                        >
                          {amount}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </Modal>

      {target && <PropertyDialog plan={plan} target={target} onClose={() => setTarget(null)} />}
    </>
  );
};
