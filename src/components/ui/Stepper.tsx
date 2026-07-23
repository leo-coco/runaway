import { useState } from 'react';
import { cn } from '@/lib/cn';
import { MinusIcon, PlusIcon } from '@/components/icons';

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  /** Static text shown before the input (e.g. a currency symbol "€"). */
  prefix?: string;
  invalid?: boolean;
  ariaLabel?: string;
  /** Hide the +/- buttons (the input stays full width with the suffix at the end). */
  hideButtons?: boolean;
  /** Shrink to content so the value sits right next to the suffix (e.g. "8%"). */
  compact?: boolean;
  disabled?: boolean;
  /** Place the decrement button before the value and the increment button after it. */
  splitButtons?: boolean;
  /** Called after the current draft is committed with the Enter key. */
  onEnter?: () => void;
}

/**
 * Numeric input with +/- steppers, matching the reference UI. Keeps a local
 * string while editing so the field can be cleared without snapping to 0.
 */
export const Stepper = ({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  prefix,
  invalid,
  ariaLabel,
  hideButtons = false,
  compact = false,
  disabled = false,
  splitButtons = false,
  onEnter,
}: StepperProps) => {
  const [draft, setDraft] = useState(String(value));
  // Sync the editable draft when the controlled value changes externally,
  // adjusting state during render (no effect needed).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(String(value));
  }

  const clamp = (n: number): number => {
    let out = n;
    if (min !== undefined) out = Math.max(min, out);
    if (max !== undefined) out = Math.min(max, out);
    return out;
  };

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
    else setDraft(String(value));
  };

  const nudge = (dir: 1 | -1) => onChange(clamp(value + dir * step));

  return (
    <div
      className={cn(
        'stepper',
        compact && 'stepper--plain',
        splitButtons && 'stepper--split',
        splitButtons && prefix && 'stepper--split-prefixed',
        splitButtons && suffix && 'stepper--split-suffixed',
        invalid && 'is-invalid',
        disabled && 'is-disabled',
      )}
    >
      {!hideButtons && !disabled && splitButtons && (
        <button
          type="button"
          className="stepper__btn"
          onClick={() => nudge(-1)}
          aria-label="Decrease"
        >
          <MinusIcon size={14} />
        </button>
      )}
      {prefix && <span className="stepper__prefix">{prefix}</span>}
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (onEnter) {
            e.preventDefault();
            commit(e.currentTarget.value);
            onEnter();
          } else {
            e.currentTarget.blur();
          }
        }}
      />
      {suffix && <span className="stepper__suffix">{suffix}</span>}
      {!hideButtons && !disabled && (
        <>
          {!splitButtons && (
            <button
              type="button"
              className="stepper__btn"
              onClick={() => nudge(-1)}
              aria-label="Decrease"
            >
              <MinusIcon size={14} />
            </button>
          )}
          <button
            type="button"
            className="stepper__btn"
            onClick={() => nudge(1)}
            aria-label="Increase"
          >
            <PlusIcon size={14} />
          </button>
        </>
      )}
    </div>
  );
};
