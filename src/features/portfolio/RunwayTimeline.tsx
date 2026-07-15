import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { RUNWAY_ICONS } from '@/components/icons';
import { useCurrencyFormatter, type CurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useAppStore } from '@/store';
import { useLimit } from '@/hooks/useEntitlements';
import { atLimit } from '@/domain/entitlements';
import { buildRunwayEvents, type RunwayEvent } from '@/services/runwayEvents';
import type { SuccessZone } from '@/domain/successRate';
import { cn } from '@/lib/cn';
import { usePlanContext } from './PlanLayout';

/** Marker circle colour class from the Monte-Carlo confidence tint. */
const ZONE_CLASS: Record<SuccessZone, string> = {
  strong: 'runway__marker--strong',
  borderline: 'runway__marker--borderline',
  weak: 'runway__marker--weak',
};

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
  ellipsisBefore,
}: {
  event: RunwayEvent;
  fmt: CurrencyFormatter;
  label: string;
  isPast: boolean;
  ellipsisBefore?: boolean;
}) => {
  const { t } = useTranslation();
  const Icon = RUNWAY_ICONS[event.icon];
  const tipParts = [label];
  if (event.amount != null && event.kind !== 'wealth-milestone') {
    tipParts.push(fmt.compact(event.amount));
  }
  if (event.labelParams?.next) {
    tipParts.push(t('runway.accountSwitchTip', { next: event.labelParams.next }));
  }
  if (event.mcRange) {
    tipParts.push(
      t('runway.mcRange', { low: event.mcRange.lowYear, high: event.mcRange.highYear }),
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
            event.confidence && ZONE_CLASS[event.confidence],
          )}
        >
          <Icon size={20} />
        </span>
        <span className="runway__year">{event.year}</span>
        <span className="runway__label">{label}</span>
      </li>
    </>
  );
};

/** Rendered width of a `.runway__item` (see index.css) — the ellipsis marker
 *  occupies a full item slot too, so spacing stays even either side of it. */
const ITEM_WIDTH = 96;

/**
 * Picks which events fit across `containerWidth` without wrapping/scrolling,
 * always keeping the first and last event and collapsing the rest behind an
 * ellipsis when there isn't room for all of them.
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

  const { visible, collapsed } = useMemo(() => {
    if (events.length <= 2 || containerWidth === 0) return { visible: events, collapsed: false };

    const totalWidth = events.length * ITEM_WIDTH;
    if (totalWidth <= containerWidth) return { visible: events, collapsed: false };

    const budget = containerWidth - ITEM_WIDTH * 3; // first + last + ellipsis
    const middleCount = Math.max(0, Math.min(events.length - 2, Math.floor(budget / ITEM_WIDTH)));
    const first = events[0]!;
    const last = events[events.length - 1]!;
    const middle = events.slice(1, 1 + middleCount);
    return { visible: [first, ...middle, last], collapsed: true };
  }, [events, containerWidth]);

  return { containerRef, visible, collapsed };
};

const AllEventsModal = ({
  events,
  fmt,
  label,
  onClose,
}: {
  events: readonly RunwayEvent[];
  fmt: CurrencyFormatter;
  label: (e: RunwayEvent) => string;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Modal title={t('runway.allEventsTitle')} onClose={onClose} wide>
      <table className="runway-table">
        <thead>
          <tr>
            <th>{t('runway.colYear')}</th>
            <th>{t('runway.colEvent')}</th>
            <th className="runway-table__amount">{t('runway.colAmount')}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.year}</td>
              <td>{label(e)}</td>
              <td className="runway-table__amount">
                {e.amount != null ? fmt.compact(e.amount) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const openModal = useAppStore((s) => s.openModal);
  const openPaywall = useAppStore((s) => s.openPaywall);
  const maxAssets = useLimit('maxAssets');

  const events = useMemo(
    () => buildRunwayEvents(plan, projection.active, monteCarlo.result ?? null),
    [plan, projection.active, monteCarlo.result],
  );
  const { containerRef, visible, collapsed } = useVisibleRunwayEvents(events);

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

  return (
    <section className={cn('runway', className)} aria-label={t('runway.title')}>
      <div className="runway__head">
        <span className="runway__title">{t('runway.title')}</span>
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
              ellipsisBefore={collapsed && i === visible.length - 1}
            />
          ))}
        </ul>
      </div>
      <button type="button" className="runway__more" onClick={() => setShowAll(true)}>
        {t('runway.seeAll')} →
      </button>

      {showAll && (
        <AllEventsModal events={events} fmt={fmt} label={label} onClose={() => setShowAll(false)} />
      )}
    </section>
  );
};
