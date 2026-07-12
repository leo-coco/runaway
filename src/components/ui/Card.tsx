import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  children: ReactNode;
}

export const Card = ({ padded = false, className, children, ...rest }: CardProps) => (
  <div className={cn('card', padded && 'card--pad', className)} {...rest}>
    {children}
  </div>
);
