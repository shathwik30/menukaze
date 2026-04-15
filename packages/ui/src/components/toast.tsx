'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn';

type ToastTone = 'neutral' | 'success' | 'danger' | 'info' | 'accent';

interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}

interface ToastContextValue {
  toast: (input: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).slice(2, 9);
      const duration = input.duration ?? 4500;
      setItems((prev) => [...prev, { ...input, id }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const toneStyles: Record<ToastTone, string> = {
  neutral: 'bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950',
  success: 'bg-jade-600 text-white dark:bg-jade-500',
  danger: 'bg-mkrose-600 text-white',
  info: 'bg-lapis-600 text-white',
  accent: 'bg-saffron-500 text-white',
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 20);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto overflow-hidden rounded-xl px-4 py-3 shadow-2xl ring-1 ring-black/5 transition-all duration-300',
        toneStyles[item.tone ?? 'neutral'],
        entering ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {item.title ? <p className="text-sm font-semibold tracking-tight">{item.title}</p> : null}
          {item.description ? (
            <p className="text-xs/relaxed opacity-90">{item.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 -mt-1 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
          aria-label="Dismiss"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: () => {},
      dismiss: () => {},
    } as ToastContextValue;
  }
  return ctx;
}
