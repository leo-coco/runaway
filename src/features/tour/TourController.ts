import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { ModalKind } from '@/store/uiSlice';
import type { TourPage, TourStep } from './tourSteps';
import { waitForElement } from './waitForElement';

export interface TourDeps {
  navigate: (path: string) => void;
  getPathname: () => string;
  getPlanId: () => string | undefined;
  openModal: (kind: ModalKind) => void;
  closeModal: () => void;
  translate: (key: string) => string;
  /** Fired once when the tour ends (finished, closed, or Esc). */
  onFinish: () => void;
}

const PAGE_PATH: Record<TourPage, string> = {
  dashboard: 'dashboard',
  projection: 'projection',
  'monte-carlo': 'monte-carlo',
  portfolio: 'portfolio',
};

const routeName = (path: string): TourPage | null => {
  const m = path.match(/\/plan\/[^/]+\/(dashboard|projection|monte-carlo|portfolio)/);
  return (m?.[1] as TourPage | undefined) ?? null;
};

const selectorFor = (s: TourStep): string | null =>
  s.selector ?? (s.tourKey ? `[data-tour="${s.tourKey}"]` : null);

export interface TourInstance {
  start: (steps: readonly TourStep[]) => void;
  stop: () => void;
  isActive: () => boolean;
}

/**
 * Orchestrates driver.js across routes and modals. For each step it navigates to
 * the right page, opens/closes the illustrative modal, waits for the anchor to
 * mount, then spotlights it. Missing anchors are skipped (in the travel
 * direction) so the tour never breaks when the UI changes.
 */
const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

export function createTour(deps: TourDeps): TourInstance {
  let d: Driver | null = null;
  let closed = true;
  let steps: readonly TourStep[] = [];
  let currentIndex = 0;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKeyDown);
    deps.closeModal();
    deps.onFinish();
  };

  // driver.js's own Escape handling works (it just closes unconditionally), but its
  // ArrowLeft/ArrowRight support depends on internal step state we never populate
  // (we drive steps ourselves via `show`, not driver's `.drive()`/`.moveTo()`), so
  // those are no-ops without this. Enter isn't wired by driver.js at all. We handle
  // all three ourselves, mirroring the next/previous buttons. Skipped while typing
  // in a field (e.g. the illustrative modals' inputs), so normal text/cursor
  // behavior there is unaffected.
  const onKeyDown = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return;
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      void show(currentIndex + 1, 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      void show(currentIndex - 1, -1);
    }
  };

  const show = async (i: number, dir: 1 | -1): Promise<void> => {
    if (closed || !d) return;
    if (i < 0) return show(0, 1);
    if (i >= steps.length) {
      d.destroy(); // triggers onDestroyStarted → cleanup
      return;
    }
    const s = steps[i]!;

    // 1. Route
    if (s.page) {
      const planId = deps.getPlanId();
      if (planId && routeName(deps.getPathname()) !== s.page) {
        deps.navigate(`/plan/${planId}/${PAGE_PATH[s.page]}`);
      }
    }

    // 2. Illustrative modal (open for this step, close otherwise)
    if (s.openModal) deps.openModal(s.openModal);
    else deps.closeModal();

    // 3. Anchor (wait for mount; skip if it never appears)
    const sel = selectorFor(s);
    let element: HTMLElement | undefined;
    if (sel) {
      const el = await waitForElement(sel, s.timeoutMs ?? 6000);
      if (closed || !d) return;
      if (!el) return show(i + dir, dir);
      element = el;
    }

    currentIndex = i;
    const isFirst = i === 0;
    const isLast = i === steps.length - 1;
    d.highlight({
      element,
      popover: {
        title: deps.translate(s.titleKey),
        description: deps.translate(s.bodyKey),
        side: s.side ?? 'bottom',
        align: s.align ?? 'start',
        showButtons: isFirst ? ['next', 'close'] : ['next', 'previous', 'close'],
        showProgress: true,
        progressText: `${i + 1} / ${steps.length}`,
        nextBtnText: isLast ? deps.translate('tour.done') : deps.translate('tour.next'),
        prevBtnText: deps.translate('tour.prev'),
        onNextClick: () => void show(i + 1, 1),
        onPrevClick: () => void show(i - 1, -1),
        // Close button and Esc use driver's default teardown (overlay click is
        // neutralized via overlayClickBehavior above); we react to it in
        // `onDestroyed` (below) rather than intercepting destroy — intercepting
        // and re-calling destroy() corrupts a re-created instance.
      },
    });

    // driver.js focuses the popover's Close button synchronously after every
    // render. If we left it there, a real Enter/Space would activate Close and
    // end the tour instead of advancing. Move focus onto the popover container
    // itself: still announced as a dialog to screen readers, but not activatable,
    // so our keydown handler is the sole authority for Enter/arrow navigation.
    const popover = document.querySelector<HTMLElement>('.driver-popover');
    if (popover) {
      popover.setAttribute('tabindex', '-1');
      popover.focus();
    }
  };

  return {
    start(nextSteps) {
      if (!closed) return;
      closed = false;
      steps = nextSteps;
      window.addEventListener('keydown', onKeyDown);
      d = driver({
        allowClose: true,
        // Disable driver.js's fade-in: when a step highlights the full-height,
        // position:fixed plan modal, driver's reposition churn keeps restarting
        // the popover's opacity animation, so it stays pinned near 0 and the
        // popover (with the Next button) is invisible — the tour looks frozen on
        // every modal step. We drive steps manually via highlight(), so the fade
        // is cosmetic anyway.
        animate: false,
        // driver.js gates the close button and Esc handling behind `allowClose`,
        // so we can't use that to disable overlay-click-to-close alone. Overriding
        // the overlay click behavior with a no-op does that instead.
        overlayClickBehavior: () => {},
        overlayColor: '#000',
        overlayOpacity: 0.72,
        stagePadding: 6,
        stageRadius: 10,
        smoothScroll: true,
        popoverClass: 'tour-popover',
        // Fires after any teardown (finish, close, Esc, overlay). Fresh instance
        // built on the next start().
        onDestroyed: () => cleanup(),
      });
      void show(0, 1);
    },
    stop() {
      d?.destroy();
    },
    isActive() {
      return !closed;
    },
  };
}
