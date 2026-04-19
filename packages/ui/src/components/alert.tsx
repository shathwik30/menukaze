import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const alertVariants = cva('relative w-full rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'border-ink-200 bg-surface text-foreground dark:border-ink-800 dark:bg-ink-900',
      info: 'border-lapis-200 bg-lapis-50 text-lapis-900 dark:border-lapis-500/30 dark:bg-lapis-500/10 dark:text-lapis-100',
      success:
        'border-jade-200 bg-jade-50 text-jade-900 dark:border-jade-500/30 dark:bg-jade-500/10 dark:text-jade-100',
      warning:
        'border-saffron-200 bg-saffron-50 text-saffron-950 dark:border-saffron-500/30 dark:bg-saffron-500/10 dark:text-saffron-100',
      destructive:
        'border-mkrose-200 bg-mkrose-50 text-mkrose-900 dark:border-mkrose-500/30 dark:bg-mkrose-500/10 dark:text-mkrose-100',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="status" className={cn(alertVariants({ variant }), className)} {...props} />
  ),
);
Alert.displayName = 'Alert';

export const AlertTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('mb-1 leading-none font-medium tracking-tight', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm leading-relaxed opacity-90', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { alertVariants };
