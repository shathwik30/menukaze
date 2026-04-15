import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const Kbd = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        'border-ink-200 bg-canvas-50 text-ink-700 inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-mono text-[10px] font-medium shadow-[inset_0_-1px_0_0_oklch(0.14_0.016_90/0.06)]',
        'dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200',
        className,
      )}
      {...props}
    />
  ),
);
Kbd.displayName = 'Kbd';
