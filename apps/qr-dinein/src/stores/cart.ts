'use client';

import { create } from 'zustand';

/**
 * The QR dine-in cart is intentionally NOT persisted — each session already
 * has a server-side record of placed rounds, so the cart only needs to hold
 * the current in-progress round until the user taps "Place round".
 */

export interface CartLine {
  itemId: string;
  name: string;
  priceMinor: number;
  quantity: number;
  notes?: string;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, 'quantity'> & { quantity?: number }) => void;
  inc: (itemId: string) => void;
  dec: (itemId: string) => void;
  remove: (itemId: string) => void;
  clear: () => void;
}

export function subtotalMinor(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.priceMinor * l.quantity, 0);
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export const useRoundCart = create<CartState>((set, get) => ({
  lines: [],
  add: (input) => {
    const lines = get().lines;
    const existing = lines.find((l) => l.itemId === input.itemId);
    if (existing) {
      set({
        lines: lines.map((l) =>
          l.itemId === input.itemId ? { ...l, quantity: l.quantity + (input.quantity ?? 1) } : l,
        ),
      });
      return;
    }
    set({ lines: [...lines, { ...input, quantity: input.quantity ?? 1 }] });
  },
  inc: (itemId) =>
    set({
      lines: get().lines.map((l) => (l.itemId === itemId ? { ...l, quantity: l.quantity + 1 } : l)),
    }),
  dec: (itemId) => {
    const next = get()
      .lines.map((l) => (l.itemId === itemId ? { ...l, quantity: l.quantity - 1 } : l))
      .filter((l) => l.quantity > 0);
    set({ lines: next });
  },
  remove: (itemId) => set({ lines: get().lines.filter((l) => l.itemId !== itemId) }),
  clear: () => set({ lines: [] }),
}));
