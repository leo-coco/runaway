import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

interface ShortcutTooltipProps {
  /** Left graphic (icon). */
  icon?: ReactNode;
  /** Main label text. */
  label: string;
  /** When set, the pill renders as a router link. */
  to?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Rich "action pill" modelled on Wealthsimple's floating "Go to Net worth"
 * control: a dark rounded pill combining a left icon and label. Reusable —
 * renders as a Link when `to` is provided, otherwise a button.
 */
export const ShortcutTooltip = ({ icon, label, to, onClick, className }: ShortcutTooltipProps) => {
  const inner = (
    <>
      {icon ? <span className="shortcut-tip__icon">{icon}</span> : null}
      <span className="shortcut-tip__label">{label}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cn('shortcut-tip', className)} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cn('shortcut-tip', className)} onClick={onClick}>
      {inner}
    </button>
  );
};
