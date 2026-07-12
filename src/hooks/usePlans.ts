import { useAppStore } from '@/store';
import type { Plan } from '@/domain/plan';

/** Select a single plan by id (or undefined). */
export const usePlan = (id: string | undefined): Plan | undefined =>
  useAppStore((s) => (id ? s.plans.find((p) => p.id === id) : undefined));
