'use client';

import { create } from 'zustand';
import {
  addCartLine,
  decrementCartLine,
  incrementCartLine,
  removeCartLine,
  setCartLineNotes,
  type CartLine,
  type CartLineInput,
} from '@menukaze/shared/cart';

/**
 * The QR dine-in cart is intentionally NOT persisted — each session already
 * has a server-side record of placed rounds, so the cart only needs to hold
 * the current in-progress round until the user taps "Place round".
 */

export {
  cartItemCount,
  cartLineKey,
  cartLineUnitMinor,
  cartSubtotalMinor,
  type CartLine,
  type CartModifier,
} from '@menukaze/shared/cart';

interface RoundCartState {
  lines: CartLine[];
  addLine: (line: CartLineInput) => void;
  incrementLine: (key: string) => void;
  decrementLine: (key: string) => void;
  removeLine: (key: string) => void;
  setNotes: (key: string, notes: string) => void;
  clear: () => void;
}
export const useRoundCart = create<RoundCartState>((set, get) => ({
  lines: [],
  addLine: (input) => set({ lines: addCartLine(get().lines, input) }),
  incrementLine: (key) => set({ lines: incrementCartLine(get().lines, key) }),
  decrementLine: (key) => set({ lines: decrementCartLine(get().lines, key) }),
  removeLine: (key) => set({ lines: removeCartLine(get().lines, key) }),
  setNotes: (key, notes) => set({ lines: setCartLineNotes(get().lines, key, notes) }),
  clear: () => set({ lines: [] }),
}));
