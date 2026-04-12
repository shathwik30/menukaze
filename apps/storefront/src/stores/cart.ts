'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartModifier {
  groupName: string;
  optionName: string;
  priceMinor: number;
}

export interface CartLine {
  itemId: string;
  name: string;
  priceMinor: number;
  quantity: number;
  modifiers: CartModifier[];
  notes?: string;
}

interface CartState {
  restaurantId: string | null;
  currency: string | null;
  locale: string | null;
  lines: CartLine[];
  /** Bind the cart to the current restaurant. Resets the cart if the tenant changes. */
  setRestaurant: (id: string, currency: string, locale: string) => void;
  addLine: (line: Omit<CartLine, 'quantity'> & { quantity?: number }) => void;
  incrementLine: (key: string) => void;
  decrementLine: (key: string) => void;
  removeLine: (key: string) => void;
  setNotes: (key: string, notes: string) => void;
  clear: () => void;
}

export function cartLineKey(line: Pick<CartLine, 'itemId' | 'modifiers'>): string {
  const mods = line.modifiers
    .map((m) => `${m.groupName}:${m.optionName}`)
    .sort()
    .join('|');
  return `${line.itemId}#${mods}`;
}

export function cartLineUnitMinor(line: Pick<CartLine, 'priceMinor' | 'modifiers'>): number {
  return line.priceMinor + line.modifiers.reduce((sum, m) => sum + m.priceMinor, 0);
}

export function cartSubtotalMinor(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + cartLineUnitMinor(l) * l.quantity, 0);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      restaurantId: null,
      currency: null,
      locale: null,
      lines: [],
      setRestaurant: (id, currency, locale) => {
        const state = get();
        if (state.restaurantId && state.restaurantId !== id) {
          set({ restaurantId: id, currency, locale, lines: [] });
        } else {
          set({ restaurantId: id, currency, locale });
        }
      },
      addLine: (input) => {
        const { lines } = get();
        const key = cartLineKey(input);
        const existing = lines.find((l) => cartLineKey(l) === key);
        if (existing) {
          set({
            lines: lines.map((l) =>
              cartLineKey(l) === key ? { ...l, quantity: l.quantity + (input.quantity ?? 1) } : l,
            ),
          });
          return;
        }
        set({ lines: [...lines, { ...input, quantity: input.quantity ?? 1 }] });
      },
      incrementLine: (key) => {
        set({
          lines: get().lines.map((l) =>
            cartLineKey(l) === key ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        });
      },
      decrementLine: (key) => {
        const next = get()
          .lines.map((l) => (cartLineKey(l) === key ? { ...l, quantity: l.quantity - 1 } : l))
          .filter((l) => l.quantity > 0);
        set({ lines: next });
      },
      removeLine: (key) => {
        set({ lines: get().lines.filter((l) => cartLineKey(l) !== key) });
      },
      setNotes: (key, notes) => {
        set({
          lines: get().lines.map((line) =>
            cartLineKey(line) === key ? { ...line, notes: notes || undefined } : line,
          ),
        });
      },
      clear: () => set({ lines: [] }),
    }),
    {
      name: 'menukaze-cart',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
