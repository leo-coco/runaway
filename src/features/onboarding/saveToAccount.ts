import type { Plan } from '@/domain/plan';
import { ACCOUNT_PLANS_KEY } from '@/store/planStorage';
import { PLANS_SCHEMA_VERSION } from '@/store';

/** Session flag set when a guest declines the save prompt, so the dashboard banner
 *  does not re-nag after they chose to explore. Shared by the quick-start result
 *  step and the standalone save banner. */
export const SAVE_BANNER_DISMISS_KEY = 'runaway/save-banner-dismissed';

/**
 * Copy the current (sandbox) plan into the signed-in account's localStorage key so
 * that, once the visitor lands on `/app` authenticated, `PlanSyncManager` adopts it
 * into the account and pushes it to the server (its existing import + over-limit
 * trim paths handle the rest).
 *
 * The two contexts use different storage keys and routers, so we bridge through
 * localStorage rather than the in-memory store. Runs at "save" click time — before
 * sign-up email verification completes — because the sandbox component may unmount
 * before a session exists. Idempotent: re-saving replaces the same entry (keyed by
 * the plan id) instead of duplicating it.
 */
export const bridgeSandboxPlanToAccount = (plan: Plan): boolean => {
  try {
    const raw = localStorage.getItem(ACCOUNT_PLANS_KEY);
    let plans: Plan[] = [];
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { plans?: Plan[] } };
      if (Array.isArray(parsed?.state?.plans)) plans = parsed.state.plans;
    }
    const adopted: Plan = { ...plan, updatedAt: new Date().toISOString() };
    const next = [...plans.filter((p) => p.id !== plan.id), adopted];
    const envelope = { state: { plans: next }, version: PLANS_SCHEMA_VERSION };
    localStorage.setItem(ACCOUNT_PLANS_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    // Storage can be unavailable (privacy mode); the sandbox still works in-memory.
    return false;
  }
};
