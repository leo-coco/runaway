import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}

export const Toggle = ({ checked, onChange, label }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={cn('switch', checked && 'on')}
    onClick={() => onChange(!checked)}
  >
    <span className="switch__dot" />
  </button>
);
