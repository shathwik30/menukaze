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
  /** 'dine_in' | 'takeaway' — chosen on the mode-select screen */
  orderMode: 'dine_in' | 'takeaway' | null;
  setRestaurant: (id: string, currency: string, locale: string) => void;
  setOrderMode: (mode: 'dine_in' | 'takeaway') => void;
  clear: () => void;
}

// Plain in-memory store — no persistence needed on a kiosk.
// The state lives as long as the browser tab is open; a hard refresh
// resets everything cleanly, which is the correct kiosk behaviour.
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
