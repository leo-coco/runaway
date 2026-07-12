import type { Side, Alignment } from 'driver.js';
import type { ModalKind } from '@/store/uiSlice';

export type TourPage = 'dashboard' | 'projection' | 'monte-carlo';

export interface TourStep {
  /** Stable id — also the i18n sub-key under `tour.steps`. */
  id: string;
  /** Preferred anchor: resolves to `[data-tour="<tourKey>"]`. Omit for a centered step. */
  tourKey?: string;
  /** Escape hatch for an existing stable selector (e.g. an id). Takes precedence over tourKey. */
  selector?: string;
  /** Route this step lives on; the controller navigates there first if needed. */
  page?: TourPage;
  /** Plan modal to open for an illustrative step (closed again when the step is left). */
  openModal?: ModalKind;
  titleKey: string;
  bodyKey: string;
  side?: Side;
  align?: Alignment;
  /** Override the wait budget for a slow-to-mount target (e.g. Monte Carlo after it runs). */
  timeoutMs?: number;
}

const step = (
  id: string,
  extra: Omit<TourStep, 'id' | 'titleKey' | 'bodyKey'>,
): TourStep => ({
  id,
  titleKey: `tour.steps.${id}.title`,
  bodyKey: `tour.steps.${id}.body`,
  ...extra,
});

/**
 * Dashboard guide: timeline → accounts & tax → adding assets → per-asset values
 * → organizing by account → savings capacity → retirement spending → scenario
 * → withdrawal strategy → currency. Every step anchors on a `data-tour` key (or
 * an existing id) so it survives design changes; the controller skips any step
 * whose anchor is absent.
 */
export const DASHBOARD_GUIDE_STEPS: readonly TourStep[] = [
  step('dashboardIntro', {}),
  step('timeline', { page: 'dashboard', tourKey: 'timeline-card', side: 'bottom', align: 'start' }),
  step('accountsButton', {
    page: 'dashboard',
    tourKey: 'accounts-card',
    side: 'bottom',
    align: 'start',
  }),
  step('accounts', {
    page: 'dashboard',
    openModal: 'accounts',
    tourKey: 'tax-residence-select',
    side: 'bottom',
    align: 'start',
  }),
  step('accountsPresets', {
    page: 'dashboard',
    openModal: 'accounts',
    tourKey: 'account-preset-add',
    side: 'bottom',
    align: 'start',
  }),
  step('addAssetButton', {
    page: 'dashboard',
    tourKey: 'addasset-btn',
    side: 'bottom',
    align: 'end',
  }),
  step('addAsset', {
    page: 'dashboard',
    openModal: 'addAsset',
    tourKey: 'addasset-tabs',
    side: 'bottom',
    align: 'start',
  }),
  step('fetchPrices', {
    page: 'dashboard',
    tourKey: 'fetch-prices-btn',
    side: 'bottom',
    align: 'end',
  }),
  step('quantity', { page: 'dashboard', tourKey: 'quantity-input', side: 'top', align: 'center' }),
  step('cagr', { page: 'dashboard', tourKey: 'cagr-input', side: 'top', align: 'center' }),
  step('drag', { page: 'dashboard', tourKey: 'drag-handle', side: 'right', align: 'start' }),
  step('savings', { page: 'dashboard', tourKey: 'savings-card', side: 'bottom', align: 'start' }),
  step('spendingButton', {
    page: 'dashboard',
    tourKey: 'spending-card',
    side: 'bottom',
    align: 'start',
  }),
  step('spending', {
    page: 'dashboard',
    openModal: 'retirementSettings',
    tourKey: 'plan-modal',
    side: 'left',
    align: 'start',
  }),
  step('scenario', {
    page: 'dashboard',
    tourKey: 'scenario-pills',
    side: 'bottom',
    align: 'start',
  }),
  step('withdrawalButton', {
    page: 'dashboard',
    tourKey: 'withdrawal-card',
    side: 'bottom',
    align: 'start',
  }),
  step('withdrawal', {
    page: 'dashboard',
    openModal: 'withdrawalOrder',
    tourKey: 'plan-modal',
    side: 'left',
    align: 'start',
  }),
  step('currency', { page: 'dashboard', tourKey: 'currency-selector', side: 'bottom', align: 'end' }),
  step('dashboardOutro', {}),
];

/** Projection guide: the deterministic year-by-year view and its lenses. */
export const PROJECTION_GUIDE_STEPS: readonly TourStep[] = [
  step('projectionIntro', {}),
  step('chartView', { page: 'projection', tourKey: 'chart-view', side: 'bottom', align: 'end' }),
  step('projectionChart', {
    page: 'projection',
    tourKey: 'projection-chart',
    side: 'top',
    align: 'center',
  }),
  step('journeyTable', {
    page: 'projection',
    tourKey: 'journey-table',
    side: 'top',
    align: 'center',
  }),
  step('calcDetails', { page: 'projection', tourKey: 'calc-details', side: 'top', align: 'center' }),
  step('projectionOutro', {}),
];

/**
 * Monte Carlo guide: thousands of simulated futures and the tools to interrogate
 * them. Targets appear only after the simulation renders → longer wait budget.
 */
export const MONTE_CARLO_GUIDE_STEPS: readonly TourStep[] = [
  step('monteCarloIntro', {}),
  step('mcFanChart', {
    page: 'monte-carlo',
    tourKey: 'mc-fan-chart',
    side: 'left',
    align: 'start',
    timeoutMs: 12000,
  }),
  step('mcModel', {
    page: 'monte-carlo',
    tourKey: 'mc-model',
    side: 'right',
    align: 'start',
    timeoutMs: 12000,
  }),
  step('mcModelInfo', {
    page: 'monte-carlo',
    tourKey: 'mc-model-info',
    side: 'right',
    align: 'center',
    timeoutMs: 12000,
  }),
  step('mcViewData', {
    page: 'monte-carlo',
    tourKey: 'mc-viewdata',
    side: 'bottom',
    align: 'start',
    timeoutMs: 12000,
  }),
  step('mcWhatIf', {
    page: 'monte-carlo',
    tourKey: 'mc-whatif',
    side: 'bottom',
    align: 'start',
    timeoutMs: 12000,
  }),
  step('mcSample', {
    page: 'monte-carlo',
    tourKey: 'mc-visualize',
    side: 'top',
    align: 'center',
    timeoutMs: 12000,
  }),
  step('monteCarloOutro', {}),
];

/** The three independently-runnable guides behind the "Take the tour" picker. */
export const TOUR_GUIDES: Record<TourPage, readonly TourStep[]> = {
  dashboard: DASHBOARD_GUIDE_STEPS,
  projection: PROJECTION_GUIDE_STEPS,
  'monte-carlo': MONTE_CARLO_GUIDE_STEPS,
};
