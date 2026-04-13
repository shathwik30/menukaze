'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  addCartLine,
  decrementCartLine,
  incrementCartLine,
  removeCartLine,
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

interface KioskCartState {
  restaurantId: string | null;
  currency: string | null;
  locale: string | null;
  /** 'dine_in' | 'takeaway' — chosen on the mode-select screen */
  orderMode: 'dine_in' | 'takeaway' | null;
  lines: CartLine[];
  setRestaurant: (id: string, currency: string, locale: string) => void;
  setOrderMode: (mode: 'dine_in' | 'takeaway') => void;
  addLine: (line: CartLineInput) => void;
  incrementLine: (key: string) => void;
  decrementLine: (key: string) => void;
  removeLine: (key: string) => void;
  clear: () => void;
}

export const useKioskCart = create<KioskCartState>()(
  persist(
    (set, get) => ({
      restaurantId: null,
      currency: null,
      locale: null,
      orderMode: null,
      lines: [],
      setRestaurant: (id, currency, locale) => {
        const state = get();
        if (state.restaurantId && state.restaurantId !== id) {
          set({ restaurantId: id, currency, locale, lines: [], orderMode: null });
        } else {
          set({ restaurantId: id, currency, locale });
        }
      },
      setOrderMode: (mode) => set({ orderMode: mode }),
      addLine: (input) => set({ lines: addCartLine(get().lines, input) }),
      incrementLine: (key) => set({ lines: incrementCartLine(get().lines, key) }),
      decrementLine: (key) => set({ lines: decrementCartLine(get().lines, key) }),
      removeLine: (key) => set({ lines: removeCartLine(get().lines, key) }),
      clear: () => set({ lines: [], orderMode: null }),
    }),
    {
      name: 'menukaze-kiosk-cart',
      // sessionStorage clears when the browser tab is closed / kiosk resets
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? sessionStorage : localStorage,
      ),
    },
  ),
);
