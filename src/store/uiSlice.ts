import type { StateCreator } from 'zustand';

/** Which plan-level modal is open, if any. */
export type ModalKind =
  | 'none'
  | 'planName'
  | 'retirementYear'
  | 'retirementSettings'
  | 'scenario'
  | 'savings'
  | 'accounts'
  | 'withdrawalOrder'
  | 'conversions'
  | 'addAsset'
  | 'expensesIncomes'
  | 'realEstate';

/**
 * What triggered the upgrade paywall — a gated feature or a hit limit. Drives the
 * contextual copy in the PaywallDialog. `null` = closed.
 */
export type PaywallReason =
  | 'upgrade'
  | 'monteCarlo'
  | 'withdrawalOrdering'
  | 'accountsTax'
  | 'accounts'
  | 'phasedSpending'
  | 'realEstate'
  | 'plans'
  | 'assets';

export interface UiSlice {
  activeModal: ModalKind;
  openModal: (kind: ModalKind) => void;
  closeModal: () => void;
  /** The upgrade paywall, if open, and what triggered it. */
  paywall: PaywallReason | null;
  openPaywall: (reason: PaywallReason) => void;
  closePaywall: () => void;
  /**
   * Latest Monte Carlo success rate (0..1) each plan's page actually computed,
   * keyed by plan id. The sidebar reads this so its figure is the SAME number the
   * Monte Carlo lens shows — not a separate, diverging estimate. Transient (never
   * persisted). `null` means a plan with no holdings (no meaningful rate).
   */
  successByPlan: Record<string, number | null>;
  setPlanSuccess: (id: string, rate: number | null) => void;
  /**
   * Whether `PlanSyncManager` has completed its initial reconciliation with the
   * server for the signed-in account. Lets plan pages show a skeleton instead of
   * rendering local/stale plan data before the server round-trip lands. Always
   * `true` outside the synced (signed-in) flow — see `PlanLayout`.
   */
  plansSynced: boolean;
  setPlansSynced: (synced: boolean) => void;
}

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  activeModal: 'none',
  openModal: (kind) => set({ activeModal: kind }),
  closeModal: () => set({ activeModal: 'none' }),
  paywall: null,
  openPaywall: (reason) => set({ paywall: reason }),
  closePaywall: () => set({ paywall: null }),
  successByPlan: {},
  setPlanSuccess: (id, rate) =>
    set((s) => {
      if (s.successByPlan[id] === rate) return s;
      return { successByPlan: { ...s.successByPlan, [id]: rate } };
    }),
  plansSynced: true,
  setPlansSynced: (synced) => set({ plansSynced: synced }),
});
