import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = 'lg', ...props }, ref) => {
    const max = {
      xs: 'max-w-xl',
      sm: 'max-w-2xl',
      md: 'max-w-4xl',
      lg: 'max-w-5xl',
      xl: 'max-w-6xl',
      full: 'max-w-none',
    }[size];
    return (
      <div
        ref={ref}
        className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', max, className)}
        {...props}
      />
    );
  },
);
Container.displayName = 'Container';

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  align?: 'start' | 'center';
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  align = 'start',
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        {eyebrow ? <div>{eyebrow}</div> : null}
        <h1 className="text-foreground font-serif text-3xl leading-[1.05] font-medium tracking-tight sm:text-4xl md:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="text-ink-500 dark:text-ink-400 max-w-2xl text-base leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

interface SectionProps extends HTMLAttributes<HTMLElement> {
  bleed?: boolean;
}
export const Section = forwardRef<HTMLElement, SectionProps>(
  ({ className, bleed, ...props }, ref) => (
    <section
      ref={ref}
      className={cn('py-10 sm:py-14', bleed ? '' : 'px-4 sm:px-6 lg:px-8', className)}
      {...props}
    />
  ),
);
Section.displayName = 'Section';
