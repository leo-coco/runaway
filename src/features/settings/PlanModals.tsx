import { useAppStore } from '@/store';
import type { Plan } from '@/domain/plan';
import { PlanNameModal } from './PlanNameModal';
import { RetirementYearModal } from './RetirementYearModal';
import { RetirementSettingsModal } from './RetirementSettingsModal';
import { ScenarioModal } from './ScenarioModal';
import { SavingsCapacityModal } from './SavingsCapacityModal';
import { AccountsModal } from './AccountsModal';
import { WithdrawalOrderModal } from './WithdrawalOrderModal';
import { ExpensesIncomesModal } from './ExpensesIncomesModal';
import { HomeModal } from './HomeModal';
import { ConversionsModal } from './ConversionsModal';
import { AddAssetDialog } from './AddAssetDialog';
import type { RatesTable } from '@/services/currencyService';

/** Renders whichever plan-level modal is currently open and wires it to the store. */
export const PlanModals = ({
  plan,
  retirementValue,
  rates,
}: {
  plan: Plan;
  retirementValue: number;
  rates: RatesTable | undefined;
}) => {
  const activeModal = useAppStore((s) => s.activeModal);
  const closeModal = useAppStore((s) => s.closeModal);
  const renamePlan = useAppStore((s) => s.renamePlan);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const updateHolding = useAppStore((s) => s.updateHolding);
  const addHolding = useAppStore((s) => s.addHolding);

  switch (activeModal) {
    case 'planName':
      return (
        <PlanNameModal
          plan={plan}
          onClose={closeModal}
          onSave={(form) => {
            renamePlan(plan.id, form.name, form.description);
            closeModal();
          }}
        />
      );
    case 'retirementYear':
      return <RetirementYearModal plan={plan} onClose={closeModal} />;
    case 'retirementSettings':
      return (
        <RetirementSettingsModal
          plan={plan}
          retirementValue={retirementValue}
          onClose={closeModal}
          onSave={(form) => {
            updateSettings(plan.id, {
              ...plan.settings,
              expensePeriod: form.expensePeriod,
              annualSpending: form.annualSpending,
              inflationPct: form.inflationPct,
              spendingMode: form.spendingMode,
              phasedSpending: {
                goGoEndAge: form.goGoEndAge,
                slowGoEndAge: form.slowGoEndAge,
                slowGoAdjustmentPct: form.slowGoAdjustmentPct,
                noGoAdjustmentPct: form.noGoAdjustmentPct,
                floorPct: form.floorPct,
              },
            });
            closeModal();
          }}
        />
      );
    case 'scenario':
      return (
        <ScenarioModal
          plan={plan}
          onClose={closeModal}
          onSave={(form) => {
            updateScenario(plan.id, {
              active: form.active,
              conservativeAdjustmentPts: form.conservativeAdjustmentPts,
              optimisticAdjustmentPts: form.optimisticAdjustmentPts,
            });
            closeModal();
          }}
        />
      );
    case 'savings':
      return (
        <SavingsCapacityModal
          plan={plan}
          onClose={closeModal}
          onSave={(contributions) => {
            for (const [holdingId, monthlyContribution] of Object.entries(contributions)) {
              updateHolding(plan.id, holdingId, { monthlyContribution });
            }
            closeModal();
          }}
        />
      );
    case 'accounts':
      return <AccountsModal plan={plan} rates={rates} onClose={closeModal} />;
    case 'withdrawalOrder':
      return <WithdrawalOrderModal plan={plan} rates={rates} onClose={closeModal} />;
    case 'expensesIncomes':
      return <ExpensesIncomesModal plan={plan} onClose={closeModal} />;
    case 'home':
      return <HomeModal plan={plan} onClose={closeModal} />;
    case 'conversions':
      return <ConversionsModal plan={plan} onClose={closeModal} />;
    case 'addAsset':
      return (
        <AddAssetDialog
          plan={plan}
          onClose={closeModal}
          onAdd={(holding) => addHolding(plan.id, holding)}
        />
      );
    case 'none':
    default:
      return null;
  }
};
