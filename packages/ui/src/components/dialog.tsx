'use client';

import { forwardRef, useEffect, useId, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  position?: 'center' | 'bottom';
  closeOnBackdrop?: boolean;
}

const sizeMap: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Dialog({
  open,
  onClose,
  children,
  labelledBy,
  describedBy,
  className,
  size = 'md',
  position = 'center',
  closeOnBackdrop = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open && panelRef.current) {
      const focusable = panelRef.current.querySelector<HTMLElement>(
        'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
  }, [open]);

  if (!open) return null;

  const containerClasses =
    position === 'bottom'
      ? 'items-end pb-4 sm:items-center sm:pb-6'
      : 'items-end pb-4 sm:items-center sm:pb-0';

  return (
    <div
      className={cn('fixed inset-0 z-50 flex justify-center px-3 sm:px-6', containerClasses)}
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => closeOnBackdrop && onClose()}
        className="bg-ink-950/60 absolute inset-0 animate-[fade-in_200ms_var(--ease-out-expo)] cursor-default backdrop-blur-sm transition-opacity"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={cn(
          'bg-surface ring-ink-200/60 dark:ring-ink-800 dark:bg-ink-900 relative w-full rounded-2xl shadow-2xl ring-1',
          'animate-[scale-in_220ms_var(--ease-spring)]',
          sizeMap[size],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export const DialogHeader = forwardRef<HTMLDivElement, DialogHeaderProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-1.5 p-6 pb-3', className)} {...props} />
  ),
);
DialogHeader.displayName = 'DialogHeader';

export const DialogTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('text-foreground font-serif text-2xl font-medium tracking-tight', className)}
      {...props}
    />
  ),
);
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-ink-500 dark:text-ink-400 text-sm', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';

export const DialogBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-6 pb-2', className)} {...props} />
  ),
);
DialogBody.displayName = 'DialogBody';

export const DialogFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'border-ink-100 bg-canvas-50 dark:border-ink-800 dark:bg-ink-900/60 flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  ),
);
DialogFooter.displayName = 'DialogFooter';

export function useDialogId(prefix = 'dialog'): string {
  return `${prefix}-${useId()}`;
}
