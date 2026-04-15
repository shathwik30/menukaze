import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  delta?: { value: string; direction?: 'up' | 'down' | 'flat' };
  icon?: ReactNode;
  caption?: string;
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, delta, icon, caption, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'border-ink-100 bg-surface group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300',
        'hover:border-ink-200 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-ink-700 hover:shadow-lg',
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(at top right, oklch(0.885 0.100 68 / 0.15), transparent 65%)',
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between">
          <p className="text-ink-500 dark:text-ink-400 text-[11px] font-semibold uppercase tracking-[0.14em]">
            {label}
          </p>
          {icon ? (
            <span className="bg-canvas-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300 inline-flex size-8 items-center justify-center rounded-lg [&_svg]:size-4">
              {icon}
            </span>
          ) : null}
        </div>
        <p className="text-foreground mt-3 font-serif text-3xl font-medium tracking-tight sm:text-4xl">
          {value}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs">
          {delta ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium',
                delta.direction === 'up' &&
                  'bg-jade-50 text-jade-700 dark:bg-jade-500/10 dark:text-jade-300',
                delta.direction === 'down' &&
                  'bg-mkrose-50 text-mkrose-700 dark:bg-mkrose-500/10 dark:text-mkrose-300',
                (!delta.direction || delta.direction === 'flat') &&
                  'bg-canvas-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
              )}
            >
              {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→'}
              {delta.value}
            </span>
          ) : null}
          {caption ? <span className="text-ink-500 dark:text-ink-400">{caption}</span> : null}
        </div>
      </div>
    </div>
  ),
);
StatCard.displayName = 'StatCard';
