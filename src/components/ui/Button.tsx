import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'default' | 'primary' | 'accent' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  children: ReactNode;
}

export const Button = ({
  variant = 'default',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    className={cn(
      'btn',
      variant === 'primary' && 'btn--primary',
      variant === 'accent' && 'btn--accent',
      variant === 'ghost' && 'btn--ghost',
      variant === 'danger' && 'btn--danger',
      size === 'sm' && 'btn--sm',
      className,
    )}
    {...rest}
  >
    {children}
  </button>
);
