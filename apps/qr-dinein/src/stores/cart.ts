'use client';

import { create } from 'zustand';
import {
  createCartLineActions,
  type CartLinesActionSlice,
  type CartLinesStateSlice,
} from '@menukaze/shared/cart-store';
import { setCartLineNotes } from '@menukaze/shared/cart';

// Intentionally NOT persisted — the session's placed rounds are the server-side
// source of truth; this store only holds the in-progress round.

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
