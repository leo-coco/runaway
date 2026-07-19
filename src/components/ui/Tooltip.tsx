import type { ReactNode } from 'react';
import { InfoIcon } from '@/components/icons';

interface Props {
  /** Tooltip text shown on hover/focus (also the accessible label). */
  text: string;
  /** Custom trigger. Defaults to an info icon. */
  children?: ReactNode;
  /** Info-icon size when no custom trigger is given. */
  size?: number;
}

/**
 * A lightweight hover/focus tooltip. Defaults to an info-icon trigger; pass
 * `children` for a custom one. CSS-only reveal (see `.tooltip` in index.css), so
 * it needs no portal or JS state.
 */
export const Tooltip = ({ text, children, size = 14 }: Props) => (
  <span className="tooltip" tabIndex={0} aria-label={text}>
    {children ?? <InfoIcon size={size} />}
    <span className="tooltip__bubble" role="tooltip">
      {text}
    </span>
  </span>
);
