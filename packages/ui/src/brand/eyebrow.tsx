import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

interface EyebrowProps extends HTMLAttributes<HTMLElement> {
  as?: 'p' | 'span' | 'div';
  tone?: 'default' | 'accent' | 'success' | 'inverse';
  withBar?: boolean;
}

export const Eyebrow = forwardRef<HTMLElement, EyebrowProps>(
  ({ as: Tag = 'p', className, tone = 'default', withBar = false, children, ...props }, ref) => {
    const toneClass = {
      default: 'text-ink-500 dark:text-ink-400',
      accent: 'text-saffron-700 dark:text-saffron-300',
      success: 'text-jade-700 dark:text-jade-300',
      inverse: 'text-canvas-100',
    }[tone];
    const barColor = {
      default: 'bg-ink-300 dark:bg-ink-600',
      accent: 'bg-saffron-500',
      success: 'bg-jade-500',
      inverse: 'bg-canvas-100',
    }[tone];

    return (
      <Tag
        ref={ref as never}
        className={cn(
          'inline-flex items-center gap-2.5 text-[11px] leading-none font-semibold tracking-[0.18em] uppercase',
          toneClass,
          className,
        )}
        {...props}
      >
        {withBar ? <span aria-hidden className={cn('inline-block h-px w-6', barColor)} /> : null}
        {children}
      </Tag>
    );
  },
);
Eyebrow.displayName = 'Eyebrow';
