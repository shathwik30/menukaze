import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap font-medium leading-none transition-colors [&_svg]:size-[1em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'bg-canvas-200 text-ink-800 dark:bg-ink-800 dark:text-canvas-100',
        subtle:
          'bg-canvas-100 text-ink-600 ring-1 ring-inset ring-ink-200 dark:bg-ink-900 dark:text-ink-300 dark:ring-ink-800',
        accent:
          'bg-saffron-100 text-saffron-900 ring-1 ring-inset ring-saffron-200 dark:bg-saffron-500/15 dark:text-saffron-200 dark:ring-saffron-500/30',
        success:
          'bg-jade-50 text-jade-800 ring-1 ring-inset ring-jade-200 dark:bg-jade-500/15 dark:text-jade-200 dark:ring-jade-500/30',
        warning:
          'bg-saffron-50 text-saffron-900 ring-1 ring-inset ring-saffron-200 dark:bg-saffron-500/10 dark:text-saffron-200 dark:ring-saffron-500/25',
        danger:
          'bg-mkrose-50 text-mkrose-800 ring-1 ring-inset ring-mkrose-200 dark:bg-mkrose-500/15 dark:text-mkrose-200 dark:ring-mkrose-500/30',
        info: 'bg-lapis-50 text-lapis-800 ring-1 ring-inset ring-lapis-200 dark:bg-lapis-500/15 dark:text-lapis-200 dark:ring-lapis-500/30',
        solid: 'bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950',
        foil: 'mk-foil text-ink-950 ring-1 ring-inset ring-saffron-600/20 shadow-sm',
        outline:
          'border border-ink-200 text-ink-700 bg-transparent dark:border-ink-700 dark:text-ink-300',
        dot: 'bg-transparent text-ink-600 dark:text-ink-300 gap-2',
      },
      size: {
        xs: 'h-5 px-1.5 text-[10px] rounded-sm',
        sm: 'h-6 px-2 text-xs rounded-md',
        md: 'h-7 px-2.5 text-xs rounded-md',
        lg: 'h-8 px-3 text-sm rounded-lg',
      },
      shape: {
        square: '',
        pill: 'rounded-full',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'sm',
      shape: 'square',
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
  dotColor?: string;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, shape, dot, dotColor, children, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant, size, shape }), className)} {...props}>
      {dot ? (
        <span
          aria-hidden
          className="relative inline-flex size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor ?? 'currentColor' }}
        >
          {dotColor ? (
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-60"
              style={{ backgroundColor: dotColor }}
            />
          ) : null}
        </span>
      ) : null}
      {children}
    </span>
  ),
);
Badge.displayName = 'Badge';

export { badgeVariants };
