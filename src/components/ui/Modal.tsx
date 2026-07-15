import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { XIcon } from '@/components/icons';

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra controls (e.g. an "Add" button) shown top-right, before the close button. */
  headerActions?: ReactNode;
  wide?: boolean;
  xl?: boolean;
  /** Edge-to-edge, near-viewport-sized modal for content-dense explorers. */
  fullscreen?: boolean;
  /** Optional styling hook for a specialised modal layout. */
  className?: string;
}

export const Modal = ({
  title,
  description,
  onClose,
  children,
  footer,
  headerActions,
  wide,
  xl,
  fullscreen,
  className,
}: ModalProps) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="overlay" role="presentation">
      <div
        className={cn(
          'modal',
          wide && 'modal--wide',
          xl && 'modal--xl',
          fullscreen && 'modal--fullscreen',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-tour="plan-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <div className="modal__head-actions">
            {headerActions}
            <button className="modal__close" onClick={onClose} aria-label="Close">
              <XIcon />
            </button>
          </div>
        </div>
        <div className="modal__body">
          {description && <p className="modal__desc">{description}</p>}
          {children}
        </div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
