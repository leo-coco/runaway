import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store';
import { useEntitlements, useEntitlementsReady } from '@/hooks/useEntitlements';
import { useAppMode } from '@/providers/AppModeContext';
import type { TierId } from '@/domain/entitlements';
import { createTour, type TourInstance } from './TourController';
import { TOUR_GUIDES, accessibleSteps, type TourGuideId } from './tourSteps';
import './tour.css';

const SEEN_KEY = 'runaway/tour-seen';

interface TourContextValue {
  startTour: (guide: TourGuideId) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

/** Access `startTour()` (e.g. from the sidebar button). */
export const useTour = (): TourContextValue => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
};

export const TourProvider = ({
  children,
  ready = true,
}: {
  children: ReactNode;
  /** Do not auto-start while a higher-priority startup dialog is unresolved. */
  ready?: boolean;
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const openModal = useAppStore((s) => s.openModal);
  const closeModal = useAppStore((s) => s.closeModal);
  const plans = useAppStore((s) => s.plans);
  const match = useMatch('/plan/:id/*');
  const activeId = match?.params.id ?? plans[0]?.id;
  // The sandbox is self-directed discovery (quick-start onboarding + the "save your
  // plan" prompt), so the welcome tour must not auto-start over it. It stays
  // available on demand via the sidebar button. Auto-start is unchanged for accounts.
  const { sandbox } = useAppMode();
  const { features, tier } = useEntitlements();
  const entitlementsReady = useEntitlementsReady();

  // The controller is created once but always reads the latest deps via this ref,
  // so navigation/store/i18n stay current across renders and language switches.
  const latest = useRef({
    navigate,
    pathname: location.pathname,
    planId: activeId,
    openModal,
    closeModal,
    t,
    features,
    sandbox,
  });
  // Keep the controller's live deps fresh after every render (post-commit, so we
  // never touch the ref during render).
  useEffect(() => {
    latest.current = {
      navigate,
      pathname: location.pathname,
      planId: activeId,
      openModal,
      closeModal,
      t,
      features,
      sandbox,
    };
  });

  // Built once on mount (not during render — it closes over the `latest` ref, whose
  // getters are only invoked later, from event handlers and the driver lifecycle).
  const tour = useRef<TourInstance | null>(null);
  useEffect(() => {
    tour.current = createTour({
      navigate: (p) => latest.current.navigate(p),
      getPathname: () => latest.current.pathname,
      getPlanId: () => latest.current.planId,
      openModal: (k) => latest.current.openModal(k),
      closeModal: () => latest.current.closeModal(),
      translate: (key) => latest.current.t(key),
      onFinish: () => {},
    });
    return () => tour.current?.stop();
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      startTour: (guide) => {
        try {
          localStorage.setItem(SEEN_KEY, '1');
        } catch {
          /* ignore blocked storage */
        }
        tour.current?.start(
          accessibleSteps(TOUR_GUIDES[guide], latest.current.features, latest.current.sandbox),
        );
      },
    }),
    [],
  );

  // Auto-start once for new users, after the first plan page is available. The
  // guard flag is set only when the timer actually fires — so React StrictMode's
  // mount/unmount/mount cycle (which cancels the first timer) can't suppress it.
  const autoStarted = useRef(false);
  useEffect(() => {
    // Wait for the real tier before filtering steps, so a premium user's first
    // session doesn't get the free-tier-trimmed guide just because entitlements
    // hadn't loaded yet.
    if (autoStarted.current || !ready || !activeId || !entitlementsReady || sandbox) return;
    let seen: boolean;
    try {
      seen = Boolean(localStorage.getItem(SEEN_KEY));
    } catch {
      seen = true; // storage blocked → don't nag
    }
    if (seen) return;
    const id = setTimeout(() => {
      autoStarted.current = true;
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* ignore */
      }
      tour.current?.start(accessibleSteps(TOUR_GUIDES.dashboard, latest.current.features, sandbox));
    }, 700);
    return () => clearTimeout(id);
  }, [activeId, entitlementsReady, ready, sandbox]);

  // Re-propose the welcome guide when a user upgrades mid-session, now showing
  // every step (including the ones the free tier had trimmed). `prevTier` only
  // starts tracking once entitlements have actually resolved, so the loading
  // fallback (always "free") is never mistaken for a real free→premium upgrade.
  const prevTier = useRef<TierId | null>(null);
  useEffect(() => {
    if (!entitlementsReady) return;
    const was = prevTier.current;
    prevTier.current = tier;
    if (was !== 'free' || tier !== 'premium') return;
    try {
      localStorage.removeItem(SEEN_KEY);
    } catch {
      /* ignore */
    }
    const id = setTimeout(() => {
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* ignore */
      }
      tour.current?.start(accessibleSteps(TOUR_GUIDES.dashboard, latest.current.features, sandbox));
    }, 700);
    return () => clearTimeout(id);
  }, [tier, entitlementsReady, sandbox]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
};
