import type { Side, Alignment } from 'driver.js';
import type { ModalKind } from '@/store/uiSlice';
import type { TierFeatures } from '@/domain/entitlements';

/** A route a step can live on. `portfolio` hosts steps but isn't a guide of its own. */
export type TourPage = 'dashboard' | 'projection' | 'monte-carlo' | 'portfolio';

/** The guides a user can actually launch from the "Take the tour" picker. */
export type TourGuideId = Exclude<TourPage, 'portfolio'>;

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
  /** Premium feature this step demonstrates; skipped entirely when the viewer lacks it. */
  requires?: keyof TierFeatures;
}

const step = (id: string, extra: Omit<TourStep, 'id' | 'titleKey' | 'bodyKey'>): TourStep => ({
  id,
  titleKey: `tour.steps.${id}.title`,
  bodyKey: `tour.steps.${id}.body`,
  ...extra,
});

/**
 * Dashboard guide, told in two acts so it reads like the order you'd actually
 * build a plan.
 *
 * Act 1 — what you own: headline runway → timeline → accounts & tax → adding
 * assets → per-asset values → organizing by account → real estate → net-worth
 * composition.
 * Act 2 — how you fund & spend: savings capacity → retirement spending →
 * one-off expenses & income → scenario → withdrawal strategy → currency.
 *
 * Every step anchors on a `data-tour` key (or an existing class/id) so it
 * survives design changes; the controller skips any step whose anchor is absent
 * (e.g. the asset-row and allocation anchors, which only exist once the plan has
 * a holding). Premium-only steps declare `requires` and are dropped for a viewer
 * whose tier lacks the feature, so a free user never lands on a locked surface.
 */
export const DASHBOARD_GUIDE_STEPS: readonly TourStep[] = [
  step('dashboardIntro', {}),
  step('runway', {
    page: 'dashboard',
    // Hero timeline card; universal (renders on every tier), so no `data-tour` of
    // its own — anchor on its stable layout class.
    selector: '.runway--hero',
    side: 'bottom',
    align: 'start',
  }),
  step('timeline', { page: 'dashboard', tourKey: 'timeline-card', side: 'bottom', align: 'start' }),
  step('accountsButton', {
    page: 'dashboard',
    tourKey: 'accounts-card',
    side: 'bottom',
    align: 'start',
    requires: 'accountsTax',
  }),
  step('accounts', {
    page: 'dashboard',
    openModal: 'accounts',
    tourKey: 'tax-residence-select',
    side: 'bottom',
    align: 'start',
    requires: 'accountsTax',
  }),
  step('accountsPresets', {
    page: 'dashboard',
    openModal: 'accounts',
    tourKey: 'account-preset-add',
    side: 'bottom',
    align: 'start',
    requires: 'accountsTax',
  }),
  step('addAssetButton', {
    page: 'portfolio',
    tourKey: 'addasset-btn',
    side: 'bottom',
    align: 'end',
  }),
  step('addAsset', {
    page: 'portfolio',
    openModal: 'addAsset',
    tourKey: 'addasset-tabs',
    side: 'bottom',
    align: 'start',
  }),
  step('fetchPrices', {
    page: 'portfolio',
    tourKey: 'fetch-prices-btn',
    side: 'bottom',
    align: 'end',
  }),
  step('editAssetButton', {
    page: 'portfolio',
    tourKey: 'edit-asset-btn',
    side: 'top',
    align: 'end',
  }),
  step('quantity', { page: 'portfolio', tourKey: 'quantity-input', side: 'top', align: 'center' }),
  step('cagr', { page: 'portfolio', tourKey: 'cagr-input', side: 'top', align: 'center' }),
  step('drag', { page: 'portfolio', tourKey: 'drag-handle', side: 'right', align: 'start' }),
  step('realEstateButton', {
    page: 'dashboard',
    tourKey: 'realestate-card',
    side: 'bottom',
    align: 'start',
    requires: 'realEstate',
  }),
  step('realEstate', {
    page: 'dashboard',
    openModal: 'realEstate',
    tourKey: 'plan-modal',
    side: 'left',
    align: 'start',
    requires: 'realEstate',
  }),
  step('allocation', {
    // Net-worth donut; only mounts once the plan has holdings, so it's skipped for
    // an empty plan (like the asset-row steps above). Not tier-gated.
    page: 'dashboard',
    tourKey: 'allocation-card',
    side: 'top',
    align: 'center',
  }),
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
    // Showcases the Linear/By-phase choice; "By phase" is premium, so this deep
    // dive is only offered when the viewer can actually use phased spending. Free
    // users still get the `spendingButton` step for setting their target income.
    requires: 'phasedSpending',
  }),
  step('expensesIncomesButton', {
    page: 'dashboard',
    tourKey: 'expenses-card',
    side: 'bottom',
    align: 'start',
  }),
  step('expensesIncomes', {
    page: 'dashboard',
    openModal: 'expensesIncomes',
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
    requires: 'withdrawalOrdering',
  }),
  step('withdrawal', {
    page: 'dashboard',
    openModal: 'withdrawalOrder',
    tourKey: 'plan-modal',
    side: 'left',
    align: 'start',
    requires: 'withdrawalOrdering',
  }),
  step('currency', {
    page: 'dashboard',
    tourKey: 'currency-selector',
    side: 'bottom',
    align: 'end',
  }),
  step('portfolioGraph', {
    // Only mounts once the plan has holdings, so it's skipped for an empty plan.
    page: 'dashboard',
    tourKey: 'portfolio-trend-card',
    side: 'top',
    align: 'center',
  }),
  step('assetsTable', {
    page: 'dashboard',
    tourKey: 'dash-assets-card',
    side: 'top',
    align: 'center',
  }),
  step('dashboardOutro', {}),
];

/** Projection guide: the deterministic year-by-year view and its lenses. */
export const PROJECTION_GUIDE_STEPS: readonly TourStep[] = [
  step('projectionIntro', {}),
  step('projectionSummary', {
    page: 'projection',
    tourKey: 'projection-summary-cards',
    side: 'bottom',
    align: 'start',
  }),
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
  step('calcDetails', {
    page: 'projection',
    tourKey: 'calc-details',
    side: 'top',
    align: 'center',
  }),
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
  step('mcOutcomes', {
    page: 'monte-carlo',
    tourKey: 'mc-outcome-breakdown',
    side: 'left',
    align: 'start',
    timeoutMs: 12000,
  }),
  step('mcNetWorth', {
    page: 'monte-carlo',
    tourKey: 'mc-net-worth',
    side: 'right',
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
export const TOUR_GUIDES: Record<TourGuideId, readonly TourStep[]> = {
  dashboard: DASHBOARD_GUIDE_STEPS,
  projection: PROJECTION_GUIDE_STEPS,
  'monte-carlo': MONTE_CARLO_GUIDE_STEPS,
};

/**
 * Drop any step that demonstrates a premium feature the viewer's tier doesn't
 * grant right now. Reads live `features` (resolved from tier + the admin-editable
 * tier_config), so a step reappears the moment that feature is toggled on — no
 * hardcoded free/premium split.
 */
export const accessibleSteps = (steps: readonly TourStep[], features: TierFeatures): TourStep[] =>
  steps.filter((s) => !s.requires || features[s.requires]);
