'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  addCartLine,
  decrementCartLine,
  incrementCartLine,
  removeCartLine,
  setCartLineNotes,
  type CartLine,
  type CartLineInput,
} from '@menukaze/shared/cart';

export {
  cartItemCount,
  cartLineKey,
  cartLineUnitMinor,
  cartSubtotalMinor,
  type CartLine,
  type CartModifier,
} from '@menukaze/shared/cart';

interface CartState {
  restaurantId: string | null;
  currency: string | null;
  locale: string | null;
  lines: CartLine[];
  /** Bind the cart to the current restaurant. Resets the cart if the tenant changes. */
  setRestaurant: (id: string, currency: string, locale: string) => void;
  addLine: (line: CartLineInput) => void;
  incrementLine: (key: string) => void;
  decrementLine: (key: string) => void;
  removeLine: (key: string) => void;
  setNotes: (key: string, notes: string) => void;
  clear: () => void;
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
      addLine: (input) => set({ lines: addCartLine(get().lines, input) }),
      incrementLine: (key) => set({ lines: incrementCartLine(get().lines, key) }),
      decrementLine: (key) => set({ lines: decrementCartLine(get().lines, key) }),
      removeLine: (key) => set({ lines: removeCartLine(get().lines, key) }),
      setNotes: (key, notes) => set({ lines: setCartLineNotes(get().lines, key, notes) }),
      clear: () => set({ lines: [] }),
    }),
    {
      name: 'menukaze-cart',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
