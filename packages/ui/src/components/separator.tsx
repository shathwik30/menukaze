import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  variant?: 'solid' | 'gradient' | 'dashed';
}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, orientation = 'horizontal', variant = 'solid', ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn(
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        variant === 'solid' && 'bg-ink-200 dark:bg-ink-800',
        variant === 'dashed' &&
          'border-ink-200 dark:border-ink-800 border-t border-dashed bg-transparent',
        variant === 'gradient' && 'mk-hairline',
        className,
      )}
      {...props}
    />
  ),
);
Separator.displayName = 'Separator';
