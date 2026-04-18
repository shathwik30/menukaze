'use client';

import { create } from 'zustand';
import {
  applyRestaurantChange,
  createCartLineActions,
  type CartLinesActionSlice,
  type RestaurantScopedCartState,
} from '@menukaze/shared/cart-store';

export {
  cartItemCount,
  cartLineKey,
  cartLineUnitMinor,
  cartSubtotalMinor,
  type CartLine,
  type CartModifier,
} from '@menukaze/shared/cart';

interface KioskCartState extends RestaurantScopedCartState, CartLinesActionSlice {
  orderMode: 'dine_in' | 'takeaway' | null;
  setRestaurant: (id: string, currency: string, locale: string) => void;
  setOrderMode: (mode: 'dine_in' | 'takeaway') => void;
  clear: () => void;
}

// In-memory only: a hard refresh resets the kiosk cleanly, which is desired.
export const useKioskCart = create<KioskCartState>((set, get) => ({
  restaurantId: null,
  currency: null,
  locale: null,
  orderMode: null,
  lines: [],
  ...createCartLineActions<KioskCartState>(set, get),
  setRestaurant: (id, currency, locale) => set(applyRestaurantChange(get(), id, currency, locale)),
  setOrderMode: (mode) => set({ orderMode: mode }),
  clear: () => set({ lines: [], orderMode: null }),
}));
