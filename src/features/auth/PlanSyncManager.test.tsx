import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store';
import { createSeedPlan } from '@/store/seed';
import type { ServerPlan } from './plansApi';
import { PlanSyncManager } from './PlanSyncManager';

const authState = vi.hoisted(() => ({ userId: 'user-1' as string | null }));
const plansApi = vi.hoisted(() => ({
  fetchPlans: vi.fn(),
  putPlan: vi.fn(),
  deletePlan: vi.fn(),
}));

vi.mock('@/lib/authClient', () => ({
  useSession: () => ({
    data: authState.userId ? { user: { id: authState.userId } } : null,
    isPending: false,
  }),
}));

vi.mock('./plansApi', () => ({
  ...plansApi,
  PlanLimitError: class PlanLimitError extends Error {
    limit = 'plans';
    max = null;
  },
}));

describe('PlanSyncManager initial reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.userId = 'user-1';
    useAppStore.getState().hydratePlans([]);
    useAppStore.getState().setPlansSynced(true);
  });

  it('keeps the shell waiting until server plans replace the local state', async () => {
    let resolvePlans!: (plans: ServerPlan[]) => void;
    plansApi.fetchPlans.mockReturnValue(
      new Promise<ServerPlan[]>((resolve) => {
        resolvePlans = resolve;
      }),
    );
    const onInitialSyncChange = vi.fn();
    render(<PlanSyncManager onInitialSyncChange={onInitialSyncChange} />);

    await waitFor(() => expect(onInitialSyncChange).toHaveBeenCalledWith(false));
    expect(useAppStore.getState().plansSynced).toBe(false);

    const serverPlan = createSeedPlan();
    await act(async () => {
      resolvePlans([
        {
          id: serverPlan.id,
          name: serverPlan.name,
          schemaVersion: 11,
          data: serverPlan,
          createdAt: serverPlan.createdAt,
          updatedAt: serverPlan.updatedAt,
        },
      ]);
    });

    await waitFor(() => expect(onInitialSyncChange).toHaveBeenLastCalledWith(true));
    expect(useAppStore.getState().plansSynced).toBe(true);
    expect(useAppStore.getState().plans).toEqual([serverPlan]);
  });

  it('keeps the shell waiting for a decision about local plans', async () => {
    const localPlan = createSeedPlan();
    useAppStore.getState().hydratePlans([localPlan]);
    plansApi.fetchPlans.mockResolvedValue([]);
    const onInitialSyncChange = vi.fn();

    render(<PlanSyncManager onInitialSyncChange={onInitialSyncChange} />);

    await screen.findByText('Import your local plans?');
    expect(onInitialSyncChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Import plans' }));

    await waitFor(() => expect(onInitialSyncChange).toHaveBeenLastCalledWith(true));
    expect(plansApi.putPlan).toHaveBeenCalledWith(localPlan);
  });
});
