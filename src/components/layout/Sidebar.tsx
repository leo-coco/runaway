import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import { Link, NavLink, useMatch, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store';
import { estimatePlanSuccess } from '@/services/planSuccess';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useIsMobileShell } from '@/hooks/useMediaQuery';
import { useFeature, useLimit } from '@/hooks/useEntitlements';
import { atLimit } from '@/domain/entitlements';
import { ProBadge } from '@/features/billing/ProBadge';
import {
  BriefcaseIcon,
  ChartScatterIcon,
  ChartSplineIcon,
  CompassIcon,
  CopyIcon,
  GearIcon,
  LayoutDashboardIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import { PlanNameModal } from '@/features/settings/PlanNameModal';
import { AuthMenu } from '@/features/auth/AuthMenu';
import { useSession } from '@/lib/authClient';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TourGuideModal } from '@/features/tour/TourGuideModal';
import runawayLogo from '@/assets/runaway-logo.png';
import type { Plan } from '@/domain/plan';
import { asCountry } from '@/domain/country';
import { useAppMode } from '@/providers/AppModeContext';

const DOTS = ['#6aa3e0', '#c084fc', '#5dcaa5', '#e0a85d', '#f0768b'];
const COLLAPSE_KEY = 'runaway/sidebar-collapsed';

type ShowTip = (label: string) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => void;

const PlanRow = ({
  plan,
  color,
  active,
  published,
  mcEnabled,
  collapsed,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  onShowTip,
  onHideTip,
}: {
  plan: Plan;
  color: string;
  active: boolean;
  /** The success rate the plan's page computed (same figure as the MC lens), or
   *  undefined if the plan hasn't been opened/simulated this session. */
  published: number | null | undefined;
  /** Whether Monte Carlo (the source of the success %) is available on this tier. */
  mcEnabled: boolean;
  collapsed: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShowTip: ShowTip;
  onHideTip: () => void;
}) => {
  // Show the exact figure the Monte Carlo page produced. Only fall back to a local
  // estimate for plans never opened this session (e.g. right after a reload). Free
  // tier has no Monte Carlo, so no success % is shown (the estimate is skipped too).
  // The FX table is required so multi-currency plans are valued like the MC page.
  const fx = useExchangeRate(plan.currency);
  const fallback = useMemo(
    () => (mcEnabled && published === undefined ? estimatePlanSuccess(plan, fx.data, 500) : null),
    [mcEnabled, published, plan, fx.data],
  );
  const pct = !mcEnabled ? null : published !== undefined ? published : fallback;
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Force the options menu closed when the sidebar collapses, so it doesn't
  // silently reappear open when re-expanded. Adjusted during render (React's
  // supported pattern for resetting state on a prop change) rather than in an
  // effect, since setState-in-effect causes an extra, avoidable render pass.
  const [prevCollapsed, setPrevCollapsed] = useState(collapsed);
  if (collapsed !== prevCollapsed) {
    setPrevCollapsed(collapsed);
    if (collapsed) setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const run = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div className={`sb-plan${active ? ' is-active' : ''}${menuOpen ? ' is-menu-open' : ''}`}>
      <button
        type="button"
        className="sb-plan__main"
        onClick={onOpen}
        aria-label={plan.name}
        onMouseEnter={onShowTip(plan.name)}
        onMouseLeave={onHideTip}
        onFocus={onShowTip(plan.name)}
        onBlur={onHideTip}
      >
        <span className="sb-plan__dot" style={{ background: color }} />
        <span className="sb-plan__name">{plan.name}</span>
        {pct !== null && <span className="sb-plan__pct">{Math.round(pct * 100)}%</span>}
      </button>
      <div className="sb-plan__menu" ref={menuRef}>
        <button
          type="button"
          className="sb-plan__act"
          aria-label={t('sidebar.optionsFor', { name: plan.name })}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <GearIcon size={15} />
        </button>
        {menuOpen && (
          <div className="sb-menu" role="menu">
            <button type="button" role="menuitem" className="sb-menu__item" onClick={run(onEdit)}>
              <PencilIcon size={14} /> {t('common.edit')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="sb-menu__item"
              onClick={run(onDuplicate)}
            >
              <CopyIcon size={14} /> {t('common.duplicate')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="sb-menu__item sb-menu__item--del"
              onClick={run(onDelete)}
            >
              <TrashIcon size={14} /> {t('common.delete')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const Sidebar = ({
  mobileOpen = false,
  onCloseMobile,
}: {
  /** Whether the off-canvas drawer is open (only meaningful below the shell breakpoint). */
  mobileOpen?: boolean;
  /** Close the mobile drawer, e.g. when the collapse button doubles as a close button. */
  onCloseMobile?: () => void;
} = {}) => {
  const plans = useAppStore((s) => s.plans);
  const createPlan = useAppStore((s) => s.createPlan);
  const deletePlan = useAppStore((s) => s.deletePlan);
  const duplicatePlan = useAppStore((s) => s.duplicatePlan);
  const renamePlan = useAppStore((s) => s.renamePlan);
  const successByPlan = useAppStore((s) => s.successByPlan);
  const openPaywall = useAppStore((s) => s.openPaywall);
  const mcEnabled = useFeature('monteCarlo');
  const maxPlans = useLimit('maxPlans');
  const canAccountsTax = useFeature('accountsTax');
  const { data: sessionData } = useSession();
  const { sandbox } = useAppMode();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const match = useMatch('/plan/:id/*');
  const activeId = match?.params.id;
  const activePlan = plans.find((p) => p.id === activeId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPlan = plans.find((p) => p.id === editingId) ?? null;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingPlan = plans.find((p) => p.id === deletingId) ?? null;
  const [tourPickerOpen, setTourPickerOpen] = useState(false);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const isMobile = useIsMobileShell();
  // Below the shell breakpoint the sidebar renders as a full-width off-canvas
  // drawer, so the icon-rail collapsed state (and its tooltips) is ignored there.
  const effectiveCollapsed = !isMobile && collapsed;
  const toggleCollapsed = () => {
    // On mobile the collapse toggle doubles as the drawer's close button.
    if (isMobile) {
      onCloseMobile?.();
      return;
    }
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore blocked storage */
      }
      return next;
    });
  };

  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  // Clear any stale tooltip when the sidebar toggles, adjusted during render
  // rather than in an effect (see the identical pattern in PlanRow above).
  const [prevCollapsedForTip, setPrevCollapsedForTip] = useState(effectiveCollapsed);
  if (effectiveCollapsed !== prevCollapsedForTip) {
    setPrevCollapsedForTip(effectiveCollapsed);
    setTip(null);
  }
  const showTip: ShowTip = (label) => (e) => {
    if (!effectiveCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  };
  const hideTip = () => setTip(null);

  const onNew = () => {
    // Free tier is capped at maxPlans; surface the paywall instead of creating.
    if (atLimit(plans.length, maxPlans)) {
      openPaywall('plans');
      return;
    }
    const taxResidence = sandbox ? undefined : asCountry(sessionData?.user?.taxResidence);
    const newId = createPlan('My plan', !canAccountsTax, taxResidence);
    navigate(`/plan/${newId}/dashboard`);
  };

  const onDuplicate = (id: string) => {
    if (atLimit(plans.length, maxPlans)) {
      openPaywall('plans');
      return;
    }
    const copyId = duplicatePlan(id);
    if (copyId) navigate(`/plan/${copyId}/dashboard`);
  };

  const confirmDelete = (id: string) => {
    deletePlan(id);
    if (id === activeId) {
      const next = plans.find((p) => p.id !== id);
      navigate(next ? `/plan/${next.id}/dashboard` : '/');
    }
    setDeletingId(null);
  };

  return (
    <>
      <aside
        className={`sidebar${effectiveCollapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-open' : ''}`}
        onScroll={hideTip}
      >
        <div className="sb-top">
          <button
            type="button"
            className="sb-toggle"
            onClick={toggleCollapsed}
            aria-label={t(
              isMobile
                ? 'common.close'
                : effectiveCollapsed
                  ? 'sidebar.expandMenu'
                  : 'sidebar.collapseMenu',
            )}
            title={t(
              isMobile
                ? 'common.close'
                : effectiveCollapsed
                  ? 'sidebar.expandMenu'
                  : 'sidebar.collapseMenu',
            )}
          >
            {effectiveCollapsed ? (
              <PanelLeftOpenIcon size={18} />
            ) : (
              <PanelLeftCloseIcon size={18} />
            )}
          </button>
          <Link to="/" className="sb-brand" aria-label="Runaway — home">
            <img
              className="sb-brand__mark"
              src={runawayLogo.src}
              width={runawayLogo.width}
              height={runawayLogo.height}
              alt=""
            />
            <span className="sb-brand__name">Runaway</span>
          </Link>
        </div>

        <div className="sb-section-label">{t('sidebar.plans')}</div>
        <div className="sb-plans">
          {plans.map((p, i) => (
            <PlanRow
              key={p.id}
              plan={p}
              color={DOTS[i % DOTS.length]!}
              active={p.id === activeId}
              published={successByPlan[p.id]}
              mcEnabled={mcEnabled}
              collapsed={effectiveCollapsed}
              onOpen={() => navigate(`/plan/${p.id}/dashboard`)}
              onEdit={() => setEditingId(p.id)}
              onDuplicate={() => onDuplicate(p.id)}
              onDelete={() => setDeletingId(p.id)}
              onShowTip={showTip}
              onHideTip={hideTip}
            />
          ))}
          <button
            type="button"
            className="sb-new"
            onClick={onNew}
            aria-label={t('sidebar.newPlan')}
            onMouseEnter={showTip(t('sidebar.newPlan'))}
            onMouseLeave={hideTip}
            onFocus={showTip(t('sidebar.newPlan'))}
            onBlur={hideTip}
          >
            <PlusIcon size={15} /> <span className="sb-new__label">{t('sidebar.newPlan')}</span>
          </button>
        </div>

        {activePlan && (
          <>
            <div className="sb-divider" />
            <nav className="sb-nav">
              <NavLink
                to={`/plan/${activePlan.id}/dashboard`}
                className="sb-nav__link"
                aria-label={t('sidebar.dashboard')}
                onMouseEnter={showTip(t('sidebar.dashboard'))}
                onMouseLeave={hideTip}
                onFocus={showTip(t('sidebar.dashboard'))}
                onBlur={hideTip}
              >
                <span aria-hidden="true" className="sb-nav__icon">
                  <LayoutDashboardIcon size={16} />
                </span>
                <span className="sb-nav__label">{t('sidebar.dashboard')}</span>
              </NavLink>
              <NavLink
                to={`/plan/${activePlan.id}/portfolio`}
                className="sb-nav__link"
                aria-label={t('sidebar.portfolio')}
                onMouseEnter={showTip(t('sidebar.portfolio'))}
                onMouseLeave={hideTip}
                onFocus={showTip(t('sidebar.portfolio'))}
                onBlur={hideTip}
              >
                <span aria-hidden="true" className="sb-nav__icon">
                  <BriefcaseIcon size={16} />
                </span>
                <span className="sb-nav__label">{t('sidebar.portfolio')}</span>
              </NavLink>
              <NavLink
                to={`/plan/${activePlan.id}/projection`}
                className="sb-nav__link"
                aria-label={t('sidebar.projection')}
                onMouseEnter={showTip(t('sidebar.projection'))}
                onMouseLeave={hideTip}
                onFocus={showTip(t('sidebar.projection'))}
                onBlur={hideTip}
              >
                <span aria-hidden="true" className="sb-nav__icon">
                  <ChartSplineIcon size={16} />
                </span>
                <span className="sb-nav__label">{t('sidebar.projection')}</span>
              </NavLink>
              {mcEnabled ? (
                <NavLink
                  to={`/plan/${activePlan.id}/monte-carlo`}
                  className="sb-nav__link"
                  aria-label={t('sidebar.monteCarlo')}
                  onMouseEnter={showTip(t('sidebar.monteCarlo'))}
                  onMouseLeave={hideTip}
                  onFocus={showTip(t('sidebar.monteCarlo'))}
                  onBlur={hideTip}
                >
                  <span aria-hidden="true" className="sb-nav__icon">
                    <ChartScatterIcon size={16} />
                  </span>
                  <span className="sb-nav__label">{t('sidebar.monteCarlo')}</span>
                </NavLink>
              ) : (
                <button
                  type="button"
                  className="sb-nav__link"
                  aria-label={t('sidebar.monteCarlo')}
                  onClick={() => openPaywall('monteCarlo')}
                  onMouseEnter={showTip(t('sidebar.monteCarlo'))}
                  onMouseLeave={hideTip}
                  onFocus={showTip(t('sidebar.monteCarlo'))}
                  onBlur={hideTip}
                >
                  <span aria-hidden="true" className="sb-nav__icon">
                    <ChartScatterIcon size={16} />
                  </span>
                  <span className="sb-nav__label">{t('sidebar.monteCarlo')}</span>
                  <ProBadge />
                </button>
              )}
              <button
                type="button"
                className="sb-nav__link"
                onClick={() => setTourPickerOpen(true)}
                onMouseEnter={showTip(t('tour.start'))}
                onMouseLeave={hideTip}
                onFocus={showTip(t('tour.start'))}
                onBlur={hideTip}
              >
                <span aria-hidden="true" className="sb-nav__icon">
                  <CompassIcon size={16} />
                </span>
                <span className="sb-nav__label">{t('tour.start')}</span>
              </button>
            </nav>
          </>
        )}

        <AuthMenu />
      </aside>

      {tip && (
        <div className="sb-tip-fixed" style={{ top: tip.top, left: tip.left }}>
          {tip.label}
        </div>
      )}

      {editingPlan && (
        <PlanNameModal
          plan={editingPlan}
          onSave={(form) => {
            renamePlan(editingPlan.id, form.name, form.description);
            setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}

      {deletingPlan && (
        <Modal
          title={t('sidebar.deletePlanTitle')}
          description={t('sidebar.deletePlanDesc', { name: deletingPlan.name })}
          onClose={() => setDeletingId(null)}
          footer={
            <>
              <Button onClick={() => setDeletingId(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={() => confirmDelete(deletingPlan.id)}>
                {t('sidebar.deletePlanConfirm')}
              </Button>
            </>
          }
        >
          <p className="section__desc">{t('sidebar.deletePlanBody')}</p>
        </Modal>
      )}

      {tourPickerOpen && <TourGuideModal onClose={() => setTourPickerOpen(false)} />}
    </>
  );
};
