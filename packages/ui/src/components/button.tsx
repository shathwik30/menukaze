import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium outline-none transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-[1.1em] [&_svg]:shrink-0 focus-visible:ring-2 focus-visible:ring-saffron-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        primary:
          'bg-ink-950 text-canvas-50 hover:bg-ink-900 active:bg-ink-800 shadow-sm hover:shadow-md active:translate-y-px dark:bg-canvas-50 dark:text-ink-950 dark:hover:bg-canvas-100',
        accent:
          'bg-saffron-500 text-white hover:bg-saffron-600 active:bg-saffron-700 shadow-[0_6px_16px_-4px_oklch(0.615_0.180_44/0.4)] hover:shadow-[0_10px_24px_-4px_oklch(0.615_0.180_44/0.5)] active:translate-y-px',
        secondary:
          'bg-canvas-100 text-ink-900 hover:bg-canvas-200 active:bg-canvas-300 dark:bg-ink-800 dark:text-canvas-50 dark:hover:bg-ink-700 border border-ink-200 dark:border-ink-700',
        outline:
          'border border-ink-300 bg-surface text-ink-900 hover:border-ink-400 hover:bg-canvas-100 active:bg-canvas-200 dark:border-ink-700 dark:text-canvas-50 dark:hover:bg-ink-800 dark:hover:border-ink-600',
        ghost:
          'text-ink-700 hover:bg-canvas-200 hover:text-ink-950 active:bg-canvas-300 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-canvas-50',
        link: 'text-ink-950 underline underline-offset-[5px] decoration-ink-300 hover:decoration-ink-950 hover:text-saffron-700 dark:text-canvas-50 dark:decoration-ink-600 dark:hover:decoration-canvas-50 [&_svg]:size-[0.9em]',
        destructive:
          'bg-mkrose-600 text-white hover:bg-mkrose-700 active:bg-mkrose-800 shadow-[0_6px_16px_-4px_oklch(0.535_0.200_24/0.35)] active:translate-y-px',
        glass:
          'mk-glass text-ink-950 hover:bg-white/90 dark:text-canvas-50 dark:hover:bg-ink-800/80 border',
      },
      size: {
        xs: 'h-7 rounded-md px-2.5 text-xs gap-1.5',
        sm: 'h-8 rounded-md px-3 text-sm',
        md: 'h-10 rounded-lg px-4 text-sm',
        lg: 'h-12 rounded-lg px-6 text-base',
        xl: 'h-14 rounded-xl px-8 text-base tracking-tight',
        '2xl': 'h-16 rounded-xl px-10 text-lg tracking-tight',
        icon: 'size-10 rounded-lg',
        'icon-sm': 'size-8 rounded-md',
        'icon-lg': 'size-12 rounded-lg',
      },
      full: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      full: false,
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, loading, disabled, children, ...props }, ref) => {
    const isLoading = loading === true;
    const isDisabled = disabled === true || isLoading;

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, full }), className)}
        disabled={isDisabled}
        aria-busy={isLoading ? true : undefined}
        {...props}
      >
        {isLoading ? (
          <svg className="animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
