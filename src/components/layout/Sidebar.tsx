import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import { Link, NavLink, useMatch, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, LANG_LABEL, type Lang } from '@/i18n';
import { useAppStore } from '@/store';
import { useThemeStore } from '@/store/themeStore';
import { estimatePlanSuccess } from '@/services/planSuccess';
import {
  CompassIcon,
  CopyIcon,
  GearIcon,
  MenuIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  SunIcon,
  TrashIcon,
} from '@/components/icons';
import { PlanNameModal } from '@/features/settings/PlanNameModal';
import { AuthMenu } from '@/features/auth/AuthMenu';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TourGuideModal } from '@/features/tour/TourGuideModal';
import type { Plan } from '@/domain/plan';

const DOTS = ['#6aa3e0', '#c084fc', '#5dcaa5', '#e0a85d', '#f0768b'];
const COLLAPSE_KEY = 'retire-on-model/sidebar-collapsed';

type ShowTip = (label: string) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => void;

const PlanRow = ({
  plan,
  color,
  active,
  published,
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
  collapsed: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShowTip: ShowTip;
  onHideTip: () => void;
}) => {
  // Show the exact figure the Monte Carlo page produced. Only fall back to a local
  // estimate for plans never opened this session (e.g. right after a reload).
  const fallback = useMemo(
    () => (published === undefined ? estimatePlanSuccess(plan, undefined, 500) : null),
    [published, plan],
  );
  const pct = published !== undefined ? published : fallback;
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
    const onDoc = (e: MouseEvent) => {
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

export const Sidebar = () => {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const plans = useAppStore((s) => s.plans);
  const createPlan = useAppStore((s) => s.createPlan);
  const deletePlan = useAppStore((s) => s.deletePlan);
  const duplicatePlan = useAppStore((s) => s.duplicatePlan);
  const renamePlan = useAppStore((s) => s.renamePlan);
  const successByPlan = useAppStore((s) => s.successByPlan);
  const { t, i18n } = useTranslation();
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
  const toggleCollapsed = () => {
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
  const [prevCollapsedForTip, setPrevCollapsedForTip] = useState(collapsed);
  if (collapsed !== prevCollapsedForTip) {
    setPrevCollapsedForTip(collapsed);
    setTip(null);
  }
  const showTip: ShowTip = (label) => (e) => {
    if (!collapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  };
  const hideTip = () => setTip(null);

  const onNew = () => {
    const newId = createPlan('My plan');
    navigate(`/plan/${newId}/dashboard`);
  };

  const onDuplicate = (id: string) => {
    const copyId = duplicatePlan(id);
    if (copyId) navigate(`/plan/${copyId}/dashboard`);
  };

  const confirmDelete = (id: string) => {
    deletePlan(id);
    if (id === activeId) {
      const next = plans.find((p) => p.id !== id);
      navigate(next ? `/plan/${next.id}/dashboard` : '/plans');
    }
    setDeletingId(null);
  };

  return (
    <>
      <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`} onScroll={hideTip}>
        <div className="sb-top">
          <button
            type="button"
            className="sb-toggle"
            onClick={toggleCollapsed}
            aria-label={t(collapsed ? 'sidebar.expandMenu' : 'sidebar.collapseMenu')}
            title={t(collapsed ? 'sidebar.expandMenu' : 'sidebar.collapseMenu')}
          >
            <MenuIcon size={18} />
          </button>
          <Link to="/" className="sb-brand" aria-label="Runway — home">
            <svg
              className="sb-brand__mark"
              viewBox="0 0 40 32"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4 26 L14 16 L22 21 L36 6"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="4" cy="26" r="2.6" fill="var(--accent)" />
              <circle cx="14" cy="16" r="2.6" fill="var(--accent)" />
              <circle cx="22" cy="21" r="2.6" fill="var(--accent)" />
              <circle cx="36" cy="6" r="3.4" fill="var(--accent)" />
            </svg>
            <span className="sb-brand__name">Runway</span>
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
              collapsed={collapsed}
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
            <div className="sb-section-label">{activePlan.name}</div>
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
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="14" y2="17" />
                  </svg>
                </span>
                <span className="sb-nav__label">{t('sidebar.dashboard')}</span>
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
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v4l3 2" />
                  </svg>
                </span>
                <span className="sb-nav__label">{t('sidebar.projection')}</span>
              </NavLink>
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
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                  </svg>
                </span>
                <span className="sb-nav__label">{t('sidebar.monteCarlo')}</span>
              </NavLink>
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

        <div className="sb-theme">
          <button
            type="button"
            className="sb-toggle"
            onClick={toggleTheme}
            aria-label={t(theme === 'dark' ? 'theme.switchToLight' : 'theme.switchToDark')}
            onMouseEnter={showTip(t(theme === 'dark' ? 'theme.dark' : 'theme.light'))}
            onMouseLeave={hideTip}
            onFocus={showTip(t(theme === 'dark' ? 'theme.dark' : 'theme.light'))}
            onBlur={hideTip}
          >
            {theme === 'dark' ? <MoonIcon size={17} /> : <SunIcon size={17} />}
          </button>
          <span className="sb-theme__label">
            {t(theme === 'dark' ? 'theme.dark' : 'theme.light')}
          </span>
        </div>

        <div className="sb-lang">
          <label htmlFor="sb-lang-select" className="sb-lang__label">
            {t('language.label')}
          </label>
          <select
            id="sb-lang-select"
            className="select"
            value={i18n.resolvedLanguage ?? 'en'}
            onChange={(e) => void i18n.changeLanguage(e.target.value as Lang)}
          >
            {SUPPORTED_LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </select>
        </div>

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
