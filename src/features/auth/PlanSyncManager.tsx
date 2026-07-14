import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/authClient';
import { useAppStore } from '@/store';
import type { Plan } from '@/domain/plan';
import { fetchPlans, putPlan, deletePlan, PlanLimitError } from './plansApi';
import type { PaywallReason } from '@/store/uiSlice';
import { ImportLocalPlansDialog } from './ImportLocalPlansDialog';

/** planId -> updatedAt of the last state we know the server has. */
type Snapshot = Map<string, string>;

/**
 * Bridges the Zustand plan store to the server. On sign-in it hydrates the store
 * from the account (or offers to import local plans on an empty account); while
 * signed in it debounces local edits and pushes upserts/deletes. Signed out, it
 * does nothing and the existing localStorage persistence is the source of truth.
 */
export const PlanSyncManager = (): React.ReactElement | null => {
  const { data: sessionData, isPending } = useSession();
  const userId = sessionData?.user?.id ?? null;

  const [importPrompt, setImportPrompt] = useState<Plan[] | null>(null);
  const syncing = useRef(false);
  const snapshot = useRef<Snapshot>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginSyncing = (plans: Plan[]) => {
    snapshot.current = new Map(plans.map((p) => [p.id, p.updatedAt]));
    syncing.current = true;
  };

  // Hydrate + reconcile whenever the resolved auth user changes.
  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      syncing.current = false;
      snapshot.current = new Map();
      return;
    }
    let cancelled = false;
    void (async () => {
      const server = await fetchPlans();
      if (cancelled) return;
      if (server.length > 0) {
        const plans = server.map((r) => r.data);
        useAppStore.getState().hydratePlans(plans);
        beginSyncing(plans);
      } else {
        const local = useAppStore.getState().plans;
        if (local.length > 0) setImportPrompt(local);
        else beginSyncing([]);
      }
    })().catch((e: unknown) => console.error('Plan sync: hydration failed', e));
    return () => {
      cancelled = true;
    };
  }, [userId, isPending]);

  // Push debounced diffs to the server while syncing is active.
  useEffect(() => {
    const flush = () => {
      const plans = useAppStore.getState().plans;
      const prev = snapshot.current;
      const next: Snapshot = new Map();
      const puts: Plan[] = [];
      for (const p of plans) {
        next.set(p.id, p.updatedAt);
        if (prev.get(p.id) !== p.updatedAt) puts.push(p);
      }
      const deletes = [...prev.keys()].filter((id) => !next.has(id));
      snapshot.current = next;
      void Promise.all([
        ...puts.map((p) => putPlan(p)),
        ...deletes.map((id) => deletePlan(id)),
      ]).catch((e: unknown) => {
        // A rejected over-limit push (client gating bypassed) surfaces the paywall
        // rather than failing silently. The over-limit local edit stays in the store.
        if (e instanceof PlanLimitError) {
          const reason: PaywallReason =
            e.limit === 'assets' ? 'assets' : e.limit === 'accounts' ? 'multiAccount' : 'plans';
          useAppStore.getState().openPaywall(reason);
        } else {
          console.error('Plan sync: push failed', e);
        }
      });
    };

    const unsub = useAppStore.subscribe((state, prevState) => {
      if (!syncing.current || state.plans === prevState.plans) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onDecide = async (doImport: boolean) => {
    const local = importPrompt ?? [];
    setImportPrompt(null);
    if (doImport) {
      await Promise.all(local.map((p) => putPlan(p))).catch((e: unknown) =>
        console.error('Plan sync: import failed', e),
      );
      beginSyncing(local);
    } else {
      useAppStore.getState().hydratePlans([]);
      beginSyncing([]);
    }
  };

  if (importPrompt) {
    return <ImportLocalPlansDialog count={importPrompt.length} onDecide={onDecide} />;
  }
  return null;
};
