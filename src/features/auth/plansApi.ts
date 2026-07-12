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

const json = async (res: Response): Promise<unknown> => {
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
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
