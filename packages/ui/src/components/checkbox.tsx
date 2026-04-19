import { Check, Minus } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, checked, defaultChecked, ...props }, ref) => (
    <span
      className={cn('relative inline-flex size-4 shrink-0 items-center justify-center', className)}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        defaultChecked={defaultChecked}
        aria-checked={indeterminate ? 'mixed' : undefined}
        className={cn(
          'peer border-ink-300 bg-surface checked:bg-ink-950 checked:border-ink-950 focus-visible:ring-saffron-500/50 dark:border-ink-700 dark:bg-ink-900 dark:checked:border-canvas-50 dark:checked:bg-canvas-50 focus-visible:ring-offset-background size-4 appearance-none rounded border shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          indeterminate && 'bg-ink-950 border-ink-950 dark:border-canvas-50 dark:bg-canvas-50',
        )}
        {...props}
      />
      {indeterminate ? (
        <Minus
          className="text-canvas-50 dark:text-ink-950 pointer-events-none absolute size-3"
          aria-hidden
        />
      ) : (
        <Check
          className="text-canvas-50 dark:text-ink-950 pointer-events-none absolute size-3 opacity-0 transition-opacity peer-checked:opacity-100"
          aria-hidden
        />
      )}
    </span>
  ),
);
Checkbox.displayName = 'Checkbox';

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Radio = forwardRef<HTMLInputElement, RadioProps>(({ className, ...props }, ref) => (
  <span
    className={cn('relative inline-flex size-4 shrink-0 items-center justify-center', className)}
  >
    <input
      ref={ref}
      type="radio"
      className="peer border-ink-300 bg-surface checked:border-ink-950 focus-visible:ring-saffron-500/50 dark:border-ink-700 dark:bg-ink-900 dark:checked:border-canvas-50 focus-visible:ring-offset-background size-4 appearance-none rounded-full border shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
    <span className="bg-ink-950 dark:bg-canvas-50 pointer-events-none absolute size-2 rounded-full opacity-0 transition-opacity peer-checked:opacity-100" />
  </span>
));
Radio.displayName = 'Radio';
