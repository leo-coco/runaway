import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CopyIcon, PencilIcon, TrashIcon } from '@/components/icons';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { totalValue, valueHoldings } from '@/services/portfolioService';
import type { Plan } from '@/domain/plan';

interface PlanCardProps {
  plan: Plan;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export const PlanCard = ({ plan, onEdit, onDuplicate, onDelete }: PlanCardProps) => {
  const navigate = useNavigate();
  const fmt = useCurrencyFormatter(plan.currency);
  // FX not applied here (library overview); single-currency total is sufficient.
  const total = totalValue(valueHoldings(plan.holdings, plan.currency, undefined));

  return (
    <Card
      className="plan-card"
      onClick={() => navigate(`/plan/${plan.id}/dashboard`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/plan/${plan.id}/dashboard`);
      }}
    >
      <h3>{plan.name}</h3>
      {plan.description && <span className="plan-card__desc">{plan.description}</span>}
      <span className="plan-card__value">{fmt.compact(total)}</span>
      <span className="plan-card__meta">
        {plan.currency} · {plan.holdings.length} asset{plan.holdings.length === 1 ? '' : 's'} ·
        retire {plan.settings.retirementYear}
      </span>
      <div className="plan-card__actions" onClick={(e) => e.stopPropagation()} role="presentation">
        <Button size="sm" variant="ghost" onClick={() => onEdit(plan.id)}>
          <PencilIcon size={14} /> Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDuplicate(plan.id)}>
          <CopyIcon size={14} /> Duplicate
        </Button>
        <Button size="sm" variant="danger" onClick={() => onDelete(plan.id)}>
          <TrashIcon size={14} /> Delete
        </Button>
      </div>
    </Card>
  );
};
