'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  applyRestaurantChange,
  createCartLineActions,
  type CartLinesActionSlice,
  type RestaurantScopedCartState,
} from '@menukaze/shared/cart-store';
import { setCartLineNotes } from '@menukaze/shared/cart';

export {
  cartItemCount,
  cartLineKey,
  cartLineUnitMinor,
  cartSubtotalMinor,
  type CartLine,
  type CartModifier,
} from '@menukaze/shared/cart';

interface CartState extends RestaurantScopedCartState, CartLinesActionSlice {
  /** Bind the cart to the current restaurant. Resets the cart if the tenant changes. */
  setRestaurant: (id: string, currency: string, locale: string) => void;
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
      ...createCartLineActions<CartState>(set, get),
      setRestaurant: (id, currency, locale) =>
        set(applyRestaurantChange(get(), id, currency, locale)),
      setNotes: (key, notes) => set({ lines: setCartLineNotes(get().lines, key, notes) }),
      clear: () => set({ lines: [] }),
    }),
    {
      name: 'menukaze-cart',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
