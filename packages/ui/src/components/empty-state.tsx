import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-ink-200 bg-canvas-50/50 dark:border-ink-800 dark:bg-ink-900/30 flex flex-col items-center justify-center rounded-2xl border border-dashed text-center',
        compact ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
    >
      {icon ? (
        <div className="bg-canvas-200 text-ink-700 ring-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-700 mb-4 inline-flex size-12 items-center justify-center rounded-2xl ring-1 [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-foreground font-serif text-xl font-medium tracking-tight">{title}</h3>
      {description ? (
        <p className="text-ink-500 dark:text-ink-400 mx-auto mt-1.5 max-w-sm text-sm">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
