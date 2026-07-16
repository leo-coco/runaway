import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ChevronDownIcon, RUNWAY_ICONS } from '@/components/icons';
import { useCurrencyFormatter, type CurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useAppStore } from '@/store';
import { useLimit } from '@/hooks/useEntitlements';
import { atLimit } from '@/domain/entitlements';
import { buildRunwayEvents, type RunwayEvent } from '@/services/runwayEvents';
import type { SuccessZone } from '@/domain/successRate';
import { ageInYear } from '@/domain/retirementSettings';
import { cn } from '@/lib/cn';
import { usePlanContext } from './PlanLayout';

type DateDisplayMode = 'year' | 'age';

/** Marker circle colour class from the Monte-Carlo confidence tint. */
const ZONE_CLASS: Record<SuccessZone, string> = {
  strong: 'runway__marker--strong',
  borderline: 'runway__marker--borderline',
  weak: 'runway__marker--weak',
};

const runwayEventTone = (event: RunwayEvent): string =>
  event.category ? `runway-event--category-${event.category}` : `runway-event--${event.kind}`;

/** The label for an event, formatting any amount param through the currency. */
const useEventLabel = (fmt: CurrencyFormatter) => {
  const { t } = useTranslation();
  return (event: RunwayEvent): string => {
    const params = { ...event.labelParams };
    if (params.amount != null) params.amount = fmt.compact(Number(params.amount));
    return t(event.labelKey, params);
  };
};

const RunwayMarker = ({
  event,
  fmt,
  label,
  isPast,
  displayedDate,
  displayedRange,
  ellipsisBefore,
}: {
  event: RunwayEvent;
  fmt: CurrencyFormatter;
  label: string;
  isPast: boolean;
  displayedDate: string;
  displayedRange?: { low: string; high: string };
  ellipsisBefore?: boolean;
}) => {
  const { t } = useTranslation();
  const Icon = RUNWAY_ICONS[event.icon] ?? RUNWAY_ICONS.wallet;
  const tipParts = [label];
  if (event.amount != null && event.kind !== 'wealth-milestone') {
    tipParts.push(fmt.compact(event.amount));
  }
  if (event.labelParams?.next) {
    tipParts.push(t('runway.accountSwitchTip', { next: event.labelParams.next }));
  }
  if (event.mcRange) {
    tipParts.push(
      t('runway.mcRange', {
        low: displayedRange?.low ?? event.mcRange.lowYear,
        high: displayedRange?.high ?? event.mcRange.highYear,
      }),
    );
  }

  return (
    <>
      {ellipsisBefore && (
        <li className="runway__item runway__item--ellipsis" aria-hidden="true">
          <span className="runway__marker runway__marker--ellipsis">⋯</span>
        </li>
      )}
      <li
        className={cn('runway__item', isPast && 'runway__item--past')}
        title={tipParts.join(' · ')}
      >
        <span
          className={cn(
            'runway__marker',
            `runway__marker--${event.kind}`,
            runwayEventTone(event),
            event.confidence && ZONE_CLASS[event.confidence],
          )}
        >
          <Icon size={20} />
        </span>
        <span className="runway__year">{displayedDate}</span>
        <span className="runway__label">{label}</span>
      </li>
    </>
  );
};

/** Rendered width of a `.runway__item` (see index.css) — the ellipsis marker
 *  occupies a full item slot too, so spacing stays even either side of it. */
export const RUNWAY_ITEM_WIDTH = 90;

export interface VisibleRunwayEvents {
  readonly visible: readonly RunwayEvent[];
  readonly collapsed: boolean;
  readonly showEllipsis: boolean;
}

/**
 * Selects the markers that fit in the card while preserving the two anchors:
 * today at the start and the plan's terminal point (death or portfolio dry) at
 * the end. When space is tight, the nearest upcoming events remain visible and
 * the ellipsis represents the later middle events before the terminal point.
 */
export const selectVisibleRunwayEvents = (
  events: readonly RunwayEvent[],
  containerWidth: number,
): VisibleRunwayEvents => {
  if (events.length <= 2 || containerWidth === 0) {
    return { visible: events, collapsed: false, showEllipsis: false };
  }

  const slots = Math.max(2, Math.floor(containerWidth / RUNWAY_ITEM_WIDTH));
  if (events.length <= slots) return { visible: events, collapsed: false, showEllipsis: false };

  // `buildRunwayEvents` keeps these as the chronological anchors. Looking them
  // up by kind keeps this component correct even if a same-year event is added.
  const today = events.find((event) => event.kind === 'today') ?? events[0]!;
  const terminal =
    events.find((event) => event.kind === 'portfolio-dry') ??
    events.find((event) => event.kind === 'projection-end') ??
    events[events.length - 1]!;
  const between = events.filter((event) => event !== today && event !== terminal);

  // One slot is the ellipsis. Fill the remaining slots from the start so the
  // card answers the useful question: what is the next milestone from today?
  const upcomingCount = Math.min(between.length, Math.max(0, slots - 3));
  const upcoming = between.slice(0, upcomingCount);
  return { visible: [today, ...upcoming, terminal], collapsed: true, showEllipsis: slots > 2 };
};

/**
 * Recalculates the marker selection whenever the available card width changes.
 */
const useVisibleRunwayEvents = (events: readonly RunwayEvent[]) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { visible, showEllipsis } = useMemo(
    () => selectVisibleRunwayEvents(events, containerWidth),
    [events, containerWidth],
  );

  return { containerRef, visible, showEllipsis };
};

const AllEventsModal = ({
  events,
  fmt,
  label,
  dateForYear,
  secondaryDateForYear,
  onClose,
}: {
  events: readonly RunwayEvent[];
  fmt: CurrencyFormatter;
  label: (e: RunwayEvent) => string;
  dateForYear: (year: number) => string;
  secondaryDateForYear: (year: number) => string | null;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const groups = events.reduce<{ year: number; events: RunwayEvent[] }[]>((result, event) => {
    const current = result.at(-1);
    if (current?.year === event.year) current.events.push(event);
    else result.push({ year: event.year, events: [event] });
    return result;
  }, []);

  const categoryLabel = (event: RunwayEvent): string | null =>
    event.category ? t(`expensesIncomes.categories.${event.category}`) : null;

  const familyLabel = (event: RunwayEvent): string => {
    if (event.kind === 'expense' || event.kind === 'home-buy') {
      return t('expensesIncomes.typeExpense');
    }
    if (event.kind === 'income' || event.kind === 'home-sell') {
      return t('expensesIncomes.typeIncome');
    }
    if (event.kind === 'wealth-milestone') return t('runway.eventTypes.milestone');
    if (event.kind === 'account-switch') return t('runway.eventTypes.accountSwitch');
    if (event.kind === 'portfolio-dry') return t('runway.eventTypes.alert');
    return t('runway.eventTypes.landmark');
  };

  const description = (event: RunwayEvent): string => {
    if (event.frequency === 'recurring' && event.kind === 'expense') {
      return t('runway.eventDescriptions.recurringExpense');
    }
    if (event.frequency === 'recurring' && event.kind === 'income') {
      return t('runway.eventDescriptions.recurringIncome');
    }
    if (event.kind === 'account-switch') {
      return t('runway.eventDescriptions.accountSwitch', { next: event.labelParams?.next });
    }
    if (event.kind === 'portfolio-dry' && event.mcRange) {
      return t('runway.eventDescriptions.portfolioDryRange', {
        low: dateForYear(event.mcRange.lowYear),
        high: dateForYear(event.mcRange.highYear),
      });
    }
    return t(`runway.eventDescriptions.${event.kind}`);
  };

  const amount = (event: RunwayEvent): string | null => {
    if (event.amount == null) return null;
    const formatted = fmt.compact(event.amount);
    if (event.kind === 'expense' || event.kind === 'home-buy') return `− ${formatted}`;
    if (event.kind === 'income' || event.kind === 'home-sell') return `+ ${formatted}`;
    return formatted;
  };

  return (
    <Modal
      title={t('runway.allEventsTitle')}
      description={t('runway.allEventsDescription')}
      onClose={onClose}
      wide
      className="runway-events-modal"
    >
      <div className="runway-events">
        {groups.map((group) => {
          const secondaryDate = secondaryDateForYear(group.year);
          return (
            <section className="runway-events__year" key={group.year}>
              <div className="runway-events__date">
                <time dateTime={`${group.year}`}>{dateForYear(group.year)}</time>
                {secondaryDate && <span>{secondaryDate}</span>}
              </div>
              <ol className="runway-events__list">
                {group.events.map((event) => {
                  const Icon = RUNWAY_ICONS[event.icon] ?? RUNWAY_ICONS.wallet;
                  const isSelected = selectedEventId === event.id;
                  const eventAmount = amount(event);
                  const category = categoryLabel(event);
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        className={cn(
                          'runway-event',
                          runwayEventTone(event),
                          isSelected && 'is-selected',
                        )}
                        aria-expanded={isSelected}
                        onClick={() => setSelectedEventId(isSelected ? null : event.id)}
                      >
                        <span className="runway-event__icon" aria-hidden="true">
                          <Icon size={20} />
                        </span>
                        <span className="runway-event__content">
                          <span className="runway-event__label">{label(event)}</span>
                          <span className="runway-event__meta">
                            {category && <span>{category}</span>}
                            <span>{familyLabel(event)}</span>
                            {event.frequency === 'recurring' && (
                              <span>{t('expensesIncomes.frequencyRecurring')}</span>
                            )}
                          </span>
                        </span>
                        {eventAmount && (
                          <span
                            className={cn(
                              'runway-event__amount',
                              (event.kind === 'income' || event.kind === 'home-sell') &&
                                'runway-event__amount--income',
                              (event.kind === 'expense' || event.kind === 'home-buy') &&
                                'runway-event__amount--expense',
                            )}
                          >
                            {eventAmount}
                          </span>
                        )}
                        <ChevronDownIcon className="runway-event__chevron" aria-hidden="true" />
                      </button>
                      {isSelected && (
                        <div
                          className={cn('runway-event__detail', runwayEventTone(event))}
                          role="region"
                        >
                          <p>{description(event)}</p>
                          {event.confidence && (
                            <span
                              className={cn('runway-event__confidence', `is-${event.confidence}`)}
                            >
                              {t(`runway.confidence.${event.confidence}`)}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </Modal>
  );
};

/**
 * Horizontal "runway" strip on the dashboard: a single timeline of the plan's
 * landmarks, financial events, wealth milestones and drawdown tipping points,
 * derived by {@link buildRunwayEvents}. A "see all events" link opens the full
 * sorted list.
 */
export const RunwayTimeline = ({ className }: { className?: string } = {}) => {
  const { plan, projection, monteCarlo } = usePlanContext();
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const label = useEventLabel(fmt);
  const [showAll, setShowAll] = useState(false);
  const [displayMode, setDisplayMode] = useState<DateDisplayMode>('year');
  const openModal = useAppStore((s) => s.openModal);
  const openPaywall = useAppStore((s) => s.openPaywall);
  const maxAssets = useLimit('maxAssets');

  const events = useMemo(
    () => buildRunwayEvents(plan, projection.active, monteCarlo.result ?? null),
    [plan, projection.active, monteCarlo.result],
  );
  const { containerRef, visible, showEllipsis } = useVisibleRunwayEvents(events);

  const canShowAge = plan.settings.currentAge > 0;
  const showAge = canShowAge && displayMode === 'age';
  const dateForYear = (year: number): string => {
    if (!showAge) return `${year}`;
    const age = ageInYear(plan.settings.currentAge, projection.startYear, year);
    return age === null ? `${year}` : t('runway.ageValue', { age });
  };
  const secondaryDateForYear = (year: number): string | null => {
    if (showAge) return `${year}`;
    if (!canShowAge) return null;
    const age = ageInYear(plan.settings.currentAge, projection.startYear, year);
    return age === null ? null : t('runway.ageValue', { age });
  };

  if (plan.holdings.length === 0) {
    const onAddAsset = () =>
      atLimit(plan.holdings.length, maxAssets) ? openPaywall('assets') : openModal('addAsset');
    return (
      <section className={cn('runway', className)} aria-label={t('runway.title')}>
        <div className="runway__head">
          <span className="runway__title">{t('runway.title')}</span>
        </div>
        <div className="runway__empty state-box">
          <span>{t('runway.addAssetPrompt')}</span>
          <Button variant="accent" onClick={onAddAsset}>
            {t('runway.addAsset')}
          </Button>
        </div>
      </section>
    );
  }

  if (events.length <= 1) return null; // nothing meaningful beyond "today"

  const currentYear = new Date().getFullYear();
  const portfolioRunsDry = events.some((event) => event.kind === 'portfolio-dry');

  return (
    <section
      className={cn('runway', className, portfolioRunsDry && 'hero__card--risk')}
      aria-label={t('runway.title')}
    >
      <div className="runway__head">
        <span className="runway__title">{t('runway.title')}</span>
        {canShowAge && (
          <span
            className="gs-unit-toggle runway__display-toggle"
            role="group"
            aria-label={t('runway.displayModeLabel')}
          >
            <button
              type="button"
              className={displayMode === 'year' ? 'is-active' : ''}
              aria-pressed={displayMode === 'year'}
              onClick={() => setDisplayMode('year')}
            >
              {t('runway.yearMode')}
            </button>
            <button
              type="button"
              className={displayMode === 'age' ? 'is-active' : ''}
              aria-pressed={displayMode === 'age'}
              onClick={() => setDisplayMode('age')}
            >
              {t('runway.ageMode')}
            </button>
          </span>
        )}
      </div>
      <div className="runway__scroll" ref={containerRef}>
        <ul className="runway__track">
          {visible.map((e, i) => (
            <RunwayMarker
              key={e.id}
              event={e}
              fmt={fmt}
              label={label(e)}
              isPast={e.year < currentYear}
              displayedDate={dateForYear(e.year)}
              displayedRange={
                e.mcRange
                  ? {
                      low: dateForYear(e.mcRange.lowYear),
                      high: dateForYear(e.mcRange.highYear),
                    }
                  : undefined
              }
              ellipsisBefore={showEllipsis && i === visible.length - 1}
            />
          ))}
        </ul>
      </div>
      <button type="button" className="runway__more" onClick={() => setShowAll(true)}>
        {t('runway.seeAll')} →
      </button>

      {showAll && (
        <AllEventsModal
          events={events}
          fmt={fmt}
          label={label}
          dateForYear={dateForYear}
          secondaryDateForYear={secondaryDateForYear}
          onClose={() => setShowAll(false)}
        />
      )}
    </section>
  );
};
