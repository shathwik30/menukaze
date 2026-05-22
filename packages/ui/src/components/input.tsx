import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

const fieldBase =
  'w-full rounded-md border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-950 placeholder:text-ink-400 transition-colors focus-visible:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-950/8 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-800 dark:bg-ink-900 dark:text-canvas-50 dark:placeholder:text-ink-500 dark:focus-visible:border-ink-600 dark:focus-visible:ring-canvas-50/10';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(
        fieldBase,
        invalid && 'border-mkrose-500 focus:border-mkrose-500 focus:ring-mkrose-500/15',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(
        fieldBase,
        'min-h-[80px] resize-y leading-relaxed',
        invalid && 'border-mkrose-500 focus:border-mkrose-500 focus:ring-mkrose-500/15',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid === true ? true : undefined}
        className={cn(
          fieldBase,
          'appearance-none pr-10 [&::-ms-expand]:hidden',
          invalid && 'border-mkrose-500 focus:border-mkrose-500',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        className="text-ink-400 dark:text-ink-500 pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  ),
);
Select.displayName = 'Select';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-ink-800 dark:text-canvas-100 text-[13px] leading-none font-medium',
        className,
      )}
      {...props}
    >
      {children}
      {required && <span className="text-saffron-600 ml-0.5">*</span>}
    </label>
  ),
);
Label.displayName = 'Label';

export function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-ink-500 dark:text-ink-400 text-xs', className)} {...props} />;
}

export function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      role="alert"
      className={cn(
        'text-mkrose-600 dark:text-mkrose-400 flex items-center gap-1.5 text-xs font-medium',
        className,
      )}
      {...props}
    />
  );
}
