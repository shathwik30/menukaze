'use client';

import { create } from 'zustand';
import {
  createCartLineActions,
  type CartLinesActionSlice,
  type CartLinesStateSlice,
} from '@menukaze/shared/cart-store';
import { setCartLineNotes } from '@menukaze/shared/cart';

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

interface RoundCartState extends CartLinesStateSlice, CartLinesActionSlice {
  setNotes: (key: string, notes: string) => void;
  clear: () => void;
}

export const useRoundCart = create<RoundCartState>((set, get) => ({
  lines: [],
  ...createCartLineActions<RoundCartState>(set, get),
  setNotes: (key, notes) => set({ lines: setCartLineNotes(get().lines, key, notes) }),
  clear: () => set({ lines: [] }),
}));
