import type { Plan } from '@/domain/plan';
import { PLANS_SCHEMA_VERSION } from '@/store';

/** A plan row as returned by the API. `data` is the full domain Plan. */
export interface ServerPlan {
  id: string;
  name: string;
  schemaVersion: number;
  data: Plan;
  createdAt: string;
  updatedAt: string;
}

/** Thrown when the server rejects a write because the user's tier limit is hit. */
export class PlanLimitError extends Error {
  readonly limit: string;
  readonly max: number | null;
  constructor(limit: string, max: number | null) {
    super(`Tier limit reached: ${limit}`);
    this.name = 'PlanLimitError';
    this.limit = limit;
    this.max = max;
  }
}

const json = async (res: Response): Promise<unknown> => {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 403) {
      try {
        const body = JSON.parse(text) as { reason?: string; limit?: string; max?: number | null };
        if (body?.reason === 'limit')
          throw new PlanLimitError(body.limit ?? 'unknown', body.max ?? null);
      } catch (e) {
        if (e instanceof PlanLimitError) throw e;
      }
    }
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
};

/** List the signed-in user's plans (most recently updated first). */
export const fetchPlans = async (): Promise<ServerPlan[]> =>
  json(await fetch('/api/plans', { credentials: 'include' })) as Promise<ServerPlan[]>;

/** Idempotent upsert of one plan, keyed by its id. */
export const putPlan = async (plan: Plan): Promise<ServerPlan> =>
  json(
    await fetch(`/api/plans/${encodeURIComponent(plan.id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: plan.name, schemaVersion: PLANS_SCHEMA_VERSION, data: plan }),
    }),
  ) as Promise<ServerPlan>;

export const deletePlan = async (id: string): Promise<void> => {
  await json(
    await fetch(`/api/plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    }),
  );
};
