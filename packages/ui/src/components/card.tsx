import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const cardVariants = cva('relative overflow-hidden transition-shadow duration-300', {
  variants: {
    variant: {
      surface: 'bg-surface border border-ink-100 dark:border-ink-800/80 shadow-sm',
      elevated: 'bg-surface border border-ink-100 dark:bg-ink-900 dark:border-ink-800 shadow-lg',
      outline: 'border border-ink-200 bg-transparent dark:border-ink-800',
      subtle: 'bg-canvas-100 border border-transparent dark:bg-ink-900/60',
      glass: 'mk-glass border shadow-xl',
      contrast:
        'bg-ink-950 text-canvas-50 border border-ink-900 dark:bg-canvas-50 dark:text-ink-950 dark:border-canvas-200',
    },
    radius: {
      sm: 'rounded-lg',
      md: 'rounded-xl',
      lg: 'rounded-2xl',
      xl: 'rounded-3xl',
    },
    hover: {
      none: '',
      lift: 'hover:shadow-xl hover:-translate-y-0.5 duration-300',
      glow: 'hover:shadow-[0_12px_40px_-8px_oklch(0.615_0.180_44/0.35)]',
    },
  },
  defaultVariants: {
    variant: 'surface',
    radius: 'md',
    hover: 'none',
  },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, radius, hover, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant, radius, hover }), className)} {...props} />
  ),
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6 pb-4', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-foreground text-lg font-semibold tracking-tight', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-ink-500 dark:text-ink-400 text-sm', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'border-ink-100 bg-canvas-50 dark:border-ink-800 dark:bg-ink-900/50 flex items-center gap-2 border-t px-6 py-4',
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { cardVariants };
