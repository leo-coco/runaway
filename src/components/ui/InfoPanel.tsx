import type { ReactNode } from 'react';
import { InfoIcon } from '@/components/icons';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** A collapsible inline information panel (replaces a modal-behind-a-button). */
export const InfoPanel = ({ title, defaultOpen = false, children }: Props) => (
  <details className="info-panel" open={defaultOpen}>
    <summary className="info-panel__summary">
      <InfoIcon size={14} />
      <span>{title}</span>
    </summary>
    <div className="info-panel__body">{children}</div>
  </details>
);
