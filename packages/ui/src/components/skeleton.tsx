import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-ink-100 dark:bg-ink-800 relative overflow-hidden rounded-md',
        'after:absolute after:inset-0 after:translate-x-[-100%] after:animate-[shimmer_1.8s_linear_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent dark:after:via-white/5',
        className,
      )}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
