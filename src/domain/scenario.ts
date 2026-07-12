/** Planning scenario applied globally on top of each asset's base CAGR. */
export const SCENARIOS = ['conservative', 'expected', 'optimistic'] as const;
export type ScenarioKey = (typeof SCENARIOS)[number];

export const SCENARIO_LABEL: Record<ScenarioKey, string> = {
  conservative: 'Pessimistic',
  expected: 'Expected',
  optimistic: 'Optimistic',
};

export const SCENARIO_DESCRIPTION: Record<ScenarioKey, string> = {
  conservative: "Applies a global downgrade to each asset's CAGR.",
  expected: 'Keeps all growth rates as projected.',
  optimistic: "Applies a global upgrade to each asset's CAGR.",
};

/**
 * Per-scenario adjustment added to each asset's base CAGR (in percentage points).
 * Mirrors the "Edit Price Projection Scenario" dialog: conservative is subtracted,
 * optimistic is added, expected is always 0.
 */
export interface ScenarioConfig {
  readonly active: ScenarioKey;
  readonly conservativeAdjustmentPts: number;
  readonly optimisticAdjustmentPts: number;
}

export const DEFAULT_SCENARIO_CONFIG: ScenarioConfig = {
  active: 'expected',
  conservativeAdjustmentPts: 2,
  optimisticAdjustmentPts: 2,
};

/** Signed CAGR adjustment (percentage points) implied by the active scenario. */
export const scenarioAdjustmentPts = (cfg: ScenarioConfig, scenario: ScenarioKey): number => {
  switch (scenario) {
    case 'conservative':
      return -cfg.conservativeAdjustmentPts;
    case 'optimistic':
      return cfg.optimisticAdjustmentPts;
    case 'expected':
      return 0;
  }
};
