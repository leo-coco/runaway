import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store';
import { createTour, type TourInstance } from './TourController';
import { TOUR_GUIDES, type TourPage } from './tourSteps';
import './tour.css';

const SEEN_KEY = 'retire-on-model/tour-seen';

interface TourContextValue {
  startTour: (guide: TourPage) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

/** Access `startTour()` (e.g. from the sidebar button). */
export const useTour = (): TourContextValue => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
};

export const TourProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const openModal = useAppStore((s) => s.openModal);
  const closeModal = useAppStore((s) => s.closeModal);
  const plans = useAppStore((s) => s.plans);
  const match = useMatch('/plan/:id/*');
  const activeId = match?.params.id ?? plans[0]?.id;

  // The controller is created once but always reads the latest deps via this ref,
  // so navigation/store/i18n stay current across renders and language switches.
  const latest = useRef({ navigate, pathname: location.pathname, planId: activeId, openModal, closeModal, t });
  // Keep the controller's live deps fresh after every render (post-commit, so we
  // never touch the ref during render).
  useEffect(() => {
    latest.current = { navigate, pathname: location.pathname, planId: activeId, openModal, closeModal, t };
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
        tour.current?.start(TOUR_GUIDES[guide]);
      },
    }),
    [],
  );

  // Auto-start once for new users, after the first plan page is available. The
  // guard flag is set only when the timer actually fires — so React StrictMode's
  // mount/unmount/mount cycle (which cancels the first timer) can't suppress it.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !activeId) return;
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
      tour.current?.start(TOUR_GUIDES.dashboard);
    }, 700);
    return () => clearTimeout(id);
  }, [activeId]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
};
