import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/Button';
import { PlusIcon } from '@/components/icons';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PlanNameModal } from '@/features/settings/PlanNameModal';
import { PlanCard } from './PlanCard';

export const PlansPage = () => {
  const navigate = useNavigate();
  const plans = useAppStore((s) => s.plans);
  const createPlan = useAppStore((s) => s.createPlan);
  const duplicatePlan = useAppStore((s) => s.duplicatePlan);
  const deletePlan = useAppStore((s) => s.deletePlan);
  const renamePlan = useAppStore((s) => s.renamePlan);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPlan = plans.find((p) => p.id === editingId) ?? null;

  const onCreate = () => {
    const id = createPlan('My plan');
    navigate(`/plan/${id}/dashboard`);
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '1rem' }}>
        <button
          style={{
            backgroundColor: '#dc2626',
            color: 'white',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '500',
          }}
        >
          Test Red Button
        </button>
      </div>
      <div className="page-head">
        <div>
          <h1>My Plans</h1>
          <p className="page-head__desc">Build and compare retirement scenarios.</p>
        </div>
        <div className="page-head__actions">
          <Button variant="accent" onClick={onCreate}>
            <PlusIcon /> New Plan
          </Button>
        </div>
      </div>

      <ErrorBoundary feature="plans">
        {plans.length === 0 ? (
          <div className="state-box">No plans yet. Create your first plan to get started.</div>
        ) : (
          <div className="plans-grid">
            {plans.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                onEdit={(id) => setEditingId(id)}
                onDuplicate={(id) => duplicatePlan(id)}
                onDelete={(id) => deletePlan(id)}
              />
            ))}
          </div>
        )}
      </ErrorBoundary>

      {editingPlan && (
        <PlanNameModal
          plan={editingPlan}
          onClose={() => setEditingId(null)}
          onSave={(form) => {
            renamePlan(editingPlan.id, form.name, form.description);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
};
