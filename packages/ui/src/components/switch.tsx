import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(({ className, ...props }, ref) => (
  <span className={cn('relative inline-flex h-5 w-9 shrink-0', className)}>
    <input ref={ref} type="checkbox" role="switch" className="peer sr-only" {...props} />
    <span
      aria-hidden
      className="bg-ink-200 peer-checked:bg-ink-950 peer-focus-visible:ring-saffron-500/50 dark:bg-ink-800 dark:peer-checked:bg-canvas-50 peer-focus-visible:ring-offset-background pointer-events-none absolute inset-0 cursor-pointer rounded-full shadow-inner transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
    />
    <span
      aria-hidden
      className="bg-surface dark:peer-checked:bg-ink-950 pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full shadow-sm transition-transform peer-checked:translate-x-4"
    />
  </span>
));
Switch.displayName = 'Switch';
