'use client';

import {
  createContext,
  useContext,
  useMemo,
  type HTMLAttributes,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { cn } from '../lib/cn';

interface TabsContextValue {
  value: string;
  onChange: (v: string) => void;
  name: string;
}
const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps {
  value: string;
  onValueChange: (v: string) => void;
  name?: string;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, name = 'tabs', children, className }: TabsProps) {
  const ctx = useMemo(
    () => ({ value, onChange: onValueChange, name }),
    [value, onValueChange, name],
  );
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn('flex flex-col gap-4', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'underline' | 'pill' | 'segmented';
}

export function TabsList({ className, variant = 'underline', ...props }: TabsListProps) {
  const variantClass = {
    underline:
      'relative flex items-center gap-4 border-b border-ink-200 overflow-x-auto dark:border-ink-800',
    pill: 'inline-flex items-center gap-1 rounded-full bg-canvas-100 p-1 dark:bg-ink-900',
    segmented:
      'inline-flex items-center rounded-lg border border-ink-200 bg-canvas-50 p-1 dark:border-ink-800 dark:bg-ink-900',
  }[variant];
  return (
    <div role="tablist" data-variant={variant} className={cn(variantClass, className)} {...props} />
  );
}

interface TabsTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  value: string;
  variant?: 'underline' | 'pill' | 'segmented';
}

export function TabsTrigger({
  value: tabValue,
  variant = 'underline',
  className,
  children,
  ...props
}: TabsTriggerProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabsTrigger must be used inside <Tabs>');
  const active = ctx.value === tabValue;

  const baseActive = {
    underline:
      'after:absolute after:-bottom-px after:left-0 after:right-0 after:h-[2px] after:bg-ink-950 dark:after:bg-canvas-50 text-ink-950 dark:text-canvas-50',
    pill: 'bg-surface text-ink-950 shadow-sm dark:bg-ink-700 dark:text-canvas-50',
    segmented: 'bg-surface text-ink-950 shadow-sm dark:bg-ink-700 dark:text-canvas-50',
  }[variant];

  const baseInactive = {
    underline: 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-canvas-100',
    pill: 'text-ink-600 hover:text-ink-950 dark:text-ink-400 dark:hover:text-canvas-50',
    segmented: 'text-ink-600 hover:text-ink-950 dark:text-ink-400 dark:hover:text-canvas-50',
  }[variant];

  const baseSize = {
    underline: 'relative px-0.5 py-3 text-sm font-medium whitespace-nowrap',
    pill: 'rounded-full px-3.5 py-1.5 text-sm font-medium',
    segmented: 'rounded-md px-3 py-1.5 text-sm font-medium',
  }[variant];

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.onChange(tabValue)}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ctx.onChange(tabValue);
        }
      }}
      className={cn(
        'focus-visible:ring-saffron-500/50 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2',
        baseSize,
        active ? baseActive : baseInactive,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({ value: tabValue, className, children, ...props }: TabsContentProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabsContent must be used inside <Tabs>');
  if (ctx.value !== tabValue) return null;
  return (
    <div
      role="tabpanel"
      className={cn('animate-[fade-in_240ms_var(--ease-out-expo)]', className)}
      {...props}
    >
      {children}
    </div>
  );
}
