'use client';

import { create } from 'zustand';

/**
 * The QR dine-in cart is intentionally NOT persisted — each session already
 * has a server-side record of placed rounds, so the cart only needs to hold
 * the current in-progress round until the user taps "Place round".
 */

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
  lines: CartLine[];
  add: (line: Omit<CartLine, 'quantity'> & { quantity?: number }) => void;
  inc: (key: string) => void;
  dec: (key: string) => void;
  remove: (key: string) => void;
  setNotes: (key: string, notes: string) => void;
  clear: () => void;
}

export function cartLineKey(line: Pick<CartLine, 'itemId' | 'modifiers'>): string {
  const mods = line.modifiers
    .map((modifier) => `${modifier.groupName}:${modifier.optionName}`)
    .sort()
    .join('|');
  return `${line.itemId}#${mods}`;
}

export function lineUnitMinor(line: Pick<CartLine, 'priceMinor' | 'modifiers'>): number {
  return line.priceMinor + line.modifiers.reduce((sum, modifier) => sum + modifier.priceMinor, 0);
}

export function subtotalMinor(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineUnitMinor(line) * line.quantity, 0);
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export const useRoundCart = create<CartState>((set, get) => ({
  lines: [],
  add: (input) => {
    const lines = get().lines;
    const key = cartLineKey(input);
    const existing = lines.find((line) => cartLineKey(line) === key);
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
  inc: (key) =>
    set({
      lines: get().lines.map((line) =>
        cartLineKey(line) === key ? { ...line, quantity: line.quantity + 1 } : line,
      ),
    }),
  dec: (key) => {
    const next = get()
      .lines.map((line) =>
        cartLineKey(line) === key ? { ...line, quantity: line.quantity - 1 } : line,
      )
      .filter((line) => line.quantity > 0);
    set({ lines: next });
  },
  remove: (key) => set({ lines: get().lines.filter((line) => cartLineKey(line) !== key) }),
  setNotes: (key, notes) =>
    set({
      lines: get().lines.map((line) =>
        cartLineKey(line) === key ? { ...line, notes: notes || undefined } : line,
      ),
    }),
  clear: () => set({ lines: [] }),
}));
