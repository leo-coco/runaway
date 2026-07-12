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
  | 'home';

export interface UiSlice {
  activeModal: ModalKind;
  openModal: (kind: ModalKind) => void;
  closeModal: () => void;
  /**
   * Latest Monte Carlo success rate (0..1) each plan's page actually computed,
   * keyed by plan id. The sidebar reads this so its figure is the SAME number the
   * Monte Carlo lens shows — not a separate, diverging estimate. Transient (never
   * persisted). `null` means a plan with no holdings (no meaningful rate).
   */
  successByPlan: Record<string, number | null>;
  setPlanSuccess: (id: string, rate: number | null) => void;
}

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  activeModal: 'none',
  openModal: (kind) => set({ activeModal: kind }),
  closeModal: () => set({ activeModal: 'none' }),
  successByPlan: {},
  setPlanSuccess: (id, rate) =>
    set((s) => {
      if (s.successByPlan[id] === rate) return s;
      return { successByPlan: { ...s.successByPlan, [id]: rate } };
    }),
});
