import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useAppStore } from '@/store';
import { lifeExpectancyYear } from '@/domain/retirementSettings';
import { successStatus } from '@/domain/successRate';
import { DEFAULT_MC_OPTIONS, buildMonteCarloInput } from '@/services/monteCarlo';
import { neutralLevers, type ActiveLeverKey, type Levers } from '@/services/goalSeek';
import { useGoalSeekBalance, useGoalSeekEval } from '@/hooks/useGoalSeekWorker';
import type { RatesTable } from '@/services/currencyService';
import type { Plan } from '@/domain/plan';

interface Props {
  plan: Plan;
  rates: RatesTable | undefined;
  onClose: () => void;
}

const SOLVE_SEED = 0x5eed1234;
// During a drag we run a light "draft" pass (snappy); once the sliders settle for
// a moment we firm up the headline with a higher-resolution pass. Solving uses a
// moderate count. Baseline and points share the DRAFT count so an untouched lever
// reads exactly +0 pts.
const DRAFT_ITERS = 700;
const REFINE_ITERS = 1500;
const SOLVE_ITERS = 1200;

const META: { key: ActiveLeverKey; labelKey: string; color: string }[] = [
  { key: 'spending', labelKey: 'goalSeek.cutSpending', color: '#6aa3e0' },
  { key: 'retireDelayYears', labelKey: 'goalSeek.retireLater', color: '#b794e0' },
  { key: 'extraMonthlySavings', labelKey: 'goalSeek.saveMore', color: '#5dcaa5' },
  { key: 'extraCapital', labelKey: 'goalSeek.addCapital', color: '#e0a85d' },
];
const META_BY_KEY = Object.fromEntries(META.map((m) => [m.key, m])) as Record<
  ActiveLeverKey,
  (typeof META)[number]
>;

// Two groups: levers that commit to the plan, and exploratory ones (holdings).
const SECTIONS: { titleKey: string; hintKey: string; keys: ActiveLeverKey[] }[] = [
  {
    titleKey: 'goalSeek.appliedTitle',
    hintKey: 'goalSeek.appliedHint',
    keys: ['spending', 'retireDelayYears'],
  },
  {
    titleKey: 'goalSeek.exploratoryTitle',
    hintKey: 'goalSeek.exploratoryHint',
    keys: ['extraMonthlySavings', 'extraCapital'],
  },
];

const ZONE_COLOR = {
  strong: 'var(--success)',
  borderline: 'var(--amber)',
  weak: 'var(--danger, #f43f5e)',
};

const LockIcon = ({ closed }: { closed: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="11" width="16" height="10" rx="2" />
    {closed ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-2" />}
  </svg>
);

export const GoalSeekModal = ({ plan, rates, onClose }: Props) => {
  const { t } = useTranslation();
  const fmt = useCurrencyFormatter(plan.currency);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const base = useMemo(() => {
    const startYear = new Date().getFullYear();
    const { currentAge, lifeExpectancyAge, retirementYear } = plan.settings;
    const endYear = lifeExpectancyYear(currentAge, startYear, lifeExpectancyAge);
    const input = buildMonteCarloInput(plan, rates, startYear, Math.max(1, endYear - startYear));
    const opts = {
      ...DEFAULT_MC_OPTIONS,
      seed: SOLVE_SEED,
      retirementHorizon: Math.max(1, endYear - retirementYear + 1),
      model: plan.settings.monteCarloModel ?? 'bootstrap',
      btcCycle: plan.settings.btcHalvingCycle ?? false,
      histStartYear: plan.settings.histStartYear,
    };
    return { input, opts };
  }, [plan, rates]);

  const totalStart = base.input.assets.reduce((s, a) => s + a.startValue, 0);
  const bounds = {
    baseSpending: base.input.annualSpending,
    maxSavings: 6000,
    maxRetireYears: 20,
    maxCapital: Math.max(totalStart * 2, 200_000),
  };
  const neutral = useMemo(() => neutralLevers(base.input.annualSpending), [base]);

  // One channel each: a refine pass must not cancel the draft pass in flight.
  const { evaluate: evaluateBaseline } = useGoalSeekEval();
  const { evaluate: evaluateDraft } = useGoalSeekEval();
  const { evaluate: evaluateRefine } = useGoalSeekEval();

  // Baseline success (neutral levers) — the "now" reference, computed once. Uses
  // the DRAFT count so an unchanged lever's points come out exactly 0. Null until
  // the worker answers: the preview below has no meaning without it.
  const [baseline, setBaseline] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void evaluateBaseline({
      input: base.input,
      options: base.opts,
      levers: [neutral],
      iterations: DRAFT_ITERS,
    }).then((r) => {
      if (!cancelled && r) setBaseline(r[0]!);
    });
    return () => {
      cancelled = true;
    };
  }, [base, neutral, evaluateBaseline]);

  const [levers, setLevers] = useState<Levers>(neutral);
  const [locked, setLocked] = useState<Record<ActiveLeverKey, boolean>>({
    spending: false,
    extraMonthlySavings: false,
    retireDelayYears: false,
    extraCapital: false,
  });
  const [targetPct, setTargetPct] = useState(80);
  const [spendingUnit, setSpendingUnit] = useState<'year' | 'month'>('year');
  const [success, setSuccess] = useState<number | null>(null);
  const [solos, setSolos] = useState<Record<ActiveLeverKey, number>>({
    spending: 0,
    extraMonthlySavings: 0,
    retireDelayYears: 0,
    extraCapital: 0,
  });
  const { balancing, error: balanceError, solve } = useGoalSeekBalance();
  const [note, setNote] = useState<string | null>(null);
  const draftTimer = useRef<number | null>(null);
  const refineTimer = useRef<number | null>(null);
  const lastComputed = useRef<Levers>(neutral); // the levers reflected in `solos`

  // Live preview. To stay snappy we (1) only recompute the points of levers that
  // actually changed since the last pass — others are cached — and (2) run a light
  // DRAFT pass during the drag, then one higher-resolution REFINE pass on the mix
  // once the sliders have been still for a moment.
  useEffect(() => {
    if (baseline === null) return;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    if (refineTimer.current) window.clearTimeout(refineTimer.current);

    draftTimer.current = window.setTimeout(() => {
      // The mix first, then each changed lever on its own — one batch, one worker
      // round-trip, so a drag never blocks the thread painting it.
      const changed = META.filter((m) => lastComputed.current[m.key] !== levers[m.key]);
      const batch = [levers, ...changed.map((m) => ({ ...neutral, [m.key]: levers[m.key] }))];
      void evaluateDraft({
        input: base.input,
        options: base.opts,
        levers: batch,
        iterations: DRAFT_ITERS,
      }).then((r) => {
        if (!r) return;
        setSuccess(r[0]!);
        if (changed.length > 0) {
          setSolos((prev) => {
            const out = { ...prev };
            changed.forEach((m, i) => {
              out[m.key] = Math.max(0, r[i + 1]! - baseline);
            });
            return out;
          });
        }
        lastComputed.current = levers;
      });
    }, 140);

    refineTimer.current = window.setTimeout(() => {
      void evaluateRefine({
        input: base.input,
        options: base.opts,
        levers: [levers],
        iterations: REFINE_ITERS,
      }).then((r) => {
        if (r) setSuccess(r[0]!);
      });
    }, 520);

    return () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
      if (refineTimer.current) window.clearTimeout(refineTimer.current);
    };
  }, [levers, base, neutral, baseline, evaluateDraft, evaluateRefine]);

  const setLever = (key: ActiveLeverKey, value: number) => {
    setNote(null);
    setLevers((l) => ({ ...l, [key]: value }));
  };

  const balance = async () => {
    setNote(null);
    const r = await solve({
      input: base.input,
      options: base.opts,
      target: targetPct / 100,
      locked,
      current: levers,
      bounds,
      iterations: SOLVE_ITERS,
    });
    if (!r) return;
    setLevers(r.levers);
    setSuccess(r.success);
    if (!r.reached) {
      setNote(t('goalSeek.topOut', { pct: Math.round(r.success * 100) }));
    }
  };

  const reset = () => {
    setNote(null);
    setLevers(neutral);
  };

  const apply = () => {
    updateSettings(plan.id, {
      ...plan.settings,
      annualSpending: Math.round(levers.spending),
      retirementYear: plan.settings.retirementYear + Math.round(levers.retireDelayYears),
    });
    onClose();
  };

  // Every figure below is expressed relative to the baseline, so there is nothing
  // meaningful to draw until the worker has it.
  if (baseline === null) {
    return (
      <Modal title={t('goalSeek.title')} description={t('goalSeek.desc')} onClose={onClose} wide>
        <div className="state-box">{t('common.loading')}</div>
      </Modal>
    );
  }

  const cur = success ?? baseline;
  const sx = successStatus(cur);
  const reached = cur >= targetPct / 100;
  const sumSolo = META.reduce((s, m) => s + solos[m.key], 0);
  const span = Math.max(0, cur - baseline);
  const segW = (k: ActiveLeverKey) => (sumSolo > 1e-6 ? (solos[k] / sumSolo) * span : 0);
  const dirty = levers.extraMonthlySavings > 0 || levers.extraCapital > 0;

  const sliderConf = (key: ActiveLeverKey) => {
    if (key === 'spending')
      return { value: bounds.baseSpending - levers.spending, max: bounds.baseSpending, step: 1000 };
    if (key === 'extraMonthlySavings')
      return { value: levers.extraMonthlySavings, max: bounds.maxSavings, step: 100 };
    if (key === 'retireDelayYears')
      return { value: levers.retireDelayYears, max: bounds.maxRetireYears, step: 1 };
    return { value: levers.extraCapital, max: bounds.maxCapital, step: 10000 };
  };
  const onSlide = (key: ActiveLeverKey, v: number) =>
    key === 'spending'
      ? setLever('spending', Math.max(0, bounds.baseSpending - v))
      : setLever(key, v);
  const valueText = (key: ActiveLeverKey) => {
    if (key === 'spending') {
      const cut = bounds.baseSpending - levers.spending;
      if (cut <= 0) return t('goalSeek.noChange');
      return spendingUnit === 'month'
        ? t('goalSeek.cutValueMonthly', { amount: fmt.format(cut / 12) })
        : t('goalSeek.cutValue', { amount: fmt.format(cut) });
    }
    if (key === 'extraMonthlySavings')
      return levers.extraMonthlySavings > 0
        ? t('goalSeek.savingsValue', { amount: fmt.format(levers.extraMonthlySavings) })
        : t('goalSeek.noChange');
    if (key === 'retireDelayYears')
      return levers.retireDelayYears > 0
        ? t('goalSeek.yearsValue', { years: levers.retireDelayYears })
        : t('goalSeek.noChange');
    return levers.extraCapital > 0
      ? t('goalSeek.capitalValue', { amount: fmt.format(levers.extraCapital) })
      : t('goalSeek.noChange');
  };

  return (
    <Modal
      title={t('goalSeek.title')}
      description={t('goalSeek.desc')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={reset}>{t('goalSeek.reset')}</Button>
          <Button onClick={balance} disabled={balancing}>
            {balancing ? t('goalSeek.balancing') : t('goalSeek.balanceToTarget')}
          </Button>
          <Button variant="primary" onClick={apply}>
            {t('goalSeek.applyMix')}
          </Button>
        </>
      }
    >
      <div className="gs-progress">
        <div className="gs-progress__top">
          <span className="gs-progress__label">{t('goalSeek.progressTo', { pct: targetPct })}</span>
          <span
            style={{ color: reached ? 'var(--success)' : 'var(--text-dim)', fontSize: '0.8125rem' }}
          >
            {reached ? t('goalSeek.targetReached') : t('goalSeek.keepGoing')}
          </span>
        </div>
        <div className="gs-bar">
          <div
            className="gs-bar__fill"
            style={{ width: `${baseline * 100}%`, background: 'var(--border-strong)' }}
          />
          {META.map((m) => (
            <div
              key={m.key}
              className="gs-bar__fill"
              style={{ width: `${segW(m.key) * 100}%`, background: m.color }}
            />
          ))}
          <div className="gs-bar__target" style={{ left: `${targetPct}%` }} />
        </div>
        <div className="gs-progress__ticks">
          <span>{t('goalSeek.nowPct', { pct: Math.round(baseline * 100) })}</span>
          <span>{t('goalSeek.targetTick', { pct: targetPct })}</span>
        </div>
        <div className="gs-progress__big">
          <b style={{ color: ZONE_COLOR[sx.zone] }}>
            {success === null ? '…' : `${sx.pct.toFixed(0)}%`}
          </b>{' '}
          {t('goalSeek.projectedSuccess')}
        </div>
      </div>

      <div className="gs-head__target" style={{ margin: '14px 0' }}>
        <span className="ov__sub">{t('goalSeek.target')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="range"
            className="gs-slider"
            min={50}
            max={95}
            step={5}
            value={targetPct}
            onChange={(e) => {
              setNote(null);
              setTargetPct(Number(e.target.value));
            }}
            aria-label={t('goalSeek.ariaTarget')}
            style={
              {
                flex: 1,
                '--gs-fill': 'var(--accent)',
                '--gs-pct': `${((targetPct - 50) / 45) * 100}%`,
              } as CSSProperties
            }
          />
          <b>{targetPct}%</b>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.titleKey} className="gs-section">
          <div className="gs-section__head">
            <span className="gs-section__title">{t(section.titleKey)}</span>
            <span className="gs-section__hint">{t(section.hintKey)}</span>
          </div>
          <div className="gs-levers">
            {section.keys.map((key) => {
              const m = META_BY_KEY[key];
              const c = sliderConf(key);
              const isLocked = locked[key];
              return (
                <div className="gs-lever" key={key}>
                  <div className="gs-lever__head">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="gs-dot" style={{ background: m.color }} />
                      {t(m.labelKey)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ color: m.color }}>
                        {t('goalSeek.points', { n: Math.round(solos[key] * 100) })}
                      </span>
                      {key === 'spending' && (
                        <span className="gs-unit-toggle" role="group">
                          <button
                            type="button"
                            className={spendingUnit === 'year' ? 'is-active' : ''}
                            aria-pressed={spendingUnit === 'year'}
                            aria-label={t('goalSeek.ariaUnitYear')}
                            onClick={() => setSpendingUnit('year')}
                          >
                            {t('goalSeek.perYear')}
                          </button>
                          <button
                            type="button"
                            className={spendingUnit === 'month' ? 'is-active' : ''}
                            aria-pressed={spendingUnit === 'month'}
                            aria-label={t('goalSeek.ariaUnitMonth')}
                            onClick={() => setSpendingUnit('month')}
                          >
                            {t('goalSeek.perMonth')}
                          </button>
                        </span>
                      )}
                      <b>{valueText(key)}</b>
                    </span>
                  </div>
                  <div className="gs-lever__row">
                    <input
                      type="range"
                      className="gs-slider"
                      min={0}
                      max={c.max}
                      step={c.step}
                      value={c.value}
                      disabled={isLocked}
                      onChange={(e) => onSlide(key, Number(e.target.value))}
                      aria-label={t(m.labelKey)}
                      style={
                        {
                          flex: 1,
                          accentColor: m.color,
                          '--gs-fill': m.color,
                          '--gs-pct': `${(c.value / c.max) * 100}%`,
                        } as CSSProperties
                      }
                    />
                    <button
                      type="button"
                      className={`gs-lock${isLocked ? ' is-locked' : ''}`}
                      aria-label={
                        isLocked
                          ? t('goalSeek.unlock', { name: t(m.labelKey) })
                          : t('goalSeek.lock', { name: t(m.labelKey) })
                      }
                      aria-pressed={isLocked}
                      onClick={() => setLocked((l) => ({ ...l, [key]: !l[key] }))}
                    >
                      <LockIcon closed={isLocked} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {(note ?? balanceError) && (
        <p className="field__hint" style={{ marginTop: 4, color: 'var(--amber)' }}>
          {note ?? balanceError}
        </p>
      )}
      <p className="field__hint">
        {t('goalSeek.bottomHint')}
        {dirty ? t('goalSeek.bottomHintDirty') : ''}
      </p>
    </Modal>
  );
};
