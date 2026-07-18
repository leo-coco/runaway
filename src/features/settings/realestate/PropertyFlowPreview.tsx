import { useTranslation } from 'react-i18next';
import { BankIcon, HomeIcon, KeyIcon } from '@/components/icons';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { isOpenEndedYear } from '@/domain/home';
import { cn } from '@/lib/cn';
import type { Plan } from '@/domain/plan';

/** The subset of an {@link ExpenseIncome} flow the preview needs to render a row. */
export interface PreviewFlow {
  readonly id: string;
  readonly kind: 'income' | 'expense';
  readonly frequency?: 'oneoff' | 'recurring';
  readonly year: number;
  readonly endYear?: number;
  readonly amount: number;
}

interface EquityPoint {
  readonly value: number;
  readonly mortgageBalance: number;
  readonly equity: number;
}

interface Props {
  plan: Plan;
  startYear: number;
  flows: readonly PreviewFlow[];
  flowLabel: (id: string) => string;
  /** The current form's annual mortgage payment, shown on the mortgage row. */
  mortgagePayment: number;
  equityNow: EquityPoint | undefined;
  equityAtRetire: EquityPoint | undefined;
  /** i18n prefix for the equity labels — `home` or `rental`. */
  tPrefix: 'home' | 'rental';
}

/**
 * Shared "Flux de ce bien" block for the property dialog: two equity tiles (today
 * / at retirement) and the live list of generated cashflows. Used by both the
 * primary-residence and rental form bodies; only the equity labels differ, keyed
 * by {@link Props.tPrefix}.
 */
export const PropertyFlowPreview = ({
  plan,
  startYear,
  flows,
  flowLabel,
  mortgagePayment,
  equityNow,
  equityAtRetire,
  tPrefix,
}: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);

  const equityTile = (label: string, point: EquityPoint | undefined) => (
    <div className="home-equity-card">
      <HomeIcon size={16} aria-hidden="true" />
      <div className="home-equity-card__copy">
        <span>{label}</span>
        <strong>{fmt.compact(point?.equity ?? 0)}</strong>
        <small>
          {t(`${tPrefix}.equityBreakdown`, {
            value: fmt.compact(point?.value ?? 0),
            mortgage: fmt.compact(point?.mortgageBalance ?? 0),
          })}
        </small>
      </div>
    </div>
  );

  return (
    <section className="home-preview">
      <div className="realestate-preview__head">
        <h4 className="home-preview__title">{t('realEstate.flowsOfProperty')}</h4>
        <span className="realestate-badge">{t('realEstate.currentBadge')}</span>
      </div>
      <p className="field__hint realestate-preview__hint">{t('realEstate.flowsOfPropertyHint')}</p>

      <div className="home-equity-grid">
        {equityTile(t(`${tPrefix}.equityNow`), equityNow)}
        {equityTile(t(`${tPrefix}.equityAt`), equityAtRetire)}
      </div>

      {flows.length === 0 ? (
        <p className="field__hint home-preview__empty">{t(`${tPrefix}.noFlows`)}</p>
      ) : (
        <div className="home-flow-table" role="table">
          {flows.map((f) => {
            const isIncome = f.kind === 'income';
            const recurring = f.frequency === 'recurring';
            const openEnded = recurring && isOpenEndedYear(f.endYear ?? f.year, startYear);
            const yearLabel = recurring && !openEnded ? `${f.year}–${f.endYear}` : `${f.year}`;
            const isMortgage = f.id.endsWith(':mortgage');
            const amountLabel = isMortgage
              ? `${fmt.compact(mortgagePayment)}${t('common.perYear')}`
              : `${isIncome ? '+' : '-'}${fmt.compact(f.amount)}${recurring ? t('common.perYear') : ''}`;
            const FlowIcon = isMortgage ? BankIcon : f.id.endsWith(':sale') ? KeyIcon : HomeIcon;
            return (
              <div className="home-flow-row" role="row" key={f.id}>
                <span className="home-flow-row__icon" aria-hidden="true">
                  <FlowIcon size={14} />
                </span>
                <span className="home-flow-row__name">{flowLabel(f.id)}</span>
                <strong className={cn(isIncome ? 'is-income' : 'is-expense')}>{amountLabel}</strong>
                <span className="home-flow-row__period">{yearLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
