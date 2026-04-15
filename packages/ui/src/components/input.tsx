import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

const fieldBase =
  'w-full rounded-lg border border-ink-200 bg-surface px-3.5 py-2.5 text-[15px] text-ink-950 placeholder:text-ink-400 shadow-xs transition-all duration-200 focus:border-saffron-400 focus:outline-none focus:ring-[3px] focus:ring-saffron-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900 dark:text-canvas-50 dark:placeholder:text-ink-500 dark:focus:border-saffron-500 dark:focus:ring-saffron-500/25';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
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
      aria-invalid={invalid || undefined}
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
        aria-invalid={invalid || undefined}
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
        className="text-ink-400 dark:text-ink-500 pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2"
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
        'text-ink-800 dark:text-canvas-100 text-[13px] font-medium leading-none',
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
