import type { CartLine, CartLineInput } from './cart';
import { addCartLine, decrementCartLine, incrementCartLine, removeCartLine } from './cart';

/**
 * Shared glue for the three cart stores (kiosk, qr-dinein, storefront).
 *
 * The pure cart mutation functions live in `./cart`. This module exposes the
 * Zustand-shaped actions and a small `setRestaurant` rule so each app's
 * store file becomes a thin assembly of shared pieces rather than repeated
 * boilerplate. `setNotes` is intentionally left to the apps that use it
 * (storefront + qr-dinein) so the kiosk store doesn't grow an unused method.
 */

export interface CartLinesStateSlice {
  lines: CartLine[];
}

export interface CartLinesActionSlice {
  addLine: (input: CartLineInput) => void;
  incrementLine: (key: string) => void;
  decrementLine: (key: string) => void;
  removeLine: (key: string) => void;
}

type SetFn<T extends CartLinesStateSlice> = (partial: Partial<T>) => void;
type GetFn<T extends CartLinesStateSlice> = () => T;

/**
 * Build the four line-mutation actions (add/increment/decrement/remove) for
 * a Zustand cart store. Apps spread the result into their `create(set, get)`
 * initializer alongside their own state and app-specific actions.
 */
export function createCartLineActions<T extends CartLinesStateSlice>(
  set: SetFn<T>,
  get: GetFn<T>,
): CartLinesActionSlice {
  return {
    addLine: (input) => set({ lines: addCartLine(get().lines, input) } as Partial<T>),
    incrementLine: (key) => set({ lines: incrementCartLine(get().lines, key) } as Partial<T>),
    decrementLine: (key) => set({ lines: decrementCartLine(get().lines, key) } as Partial<T>),
    removeLine: (key) => set({ lines: removeCartLine(get().lines, key) } as Partial<T>),
  };
}

export interface RestaurantScopedCartState extends CartLinesStateSlice {
  restaurantId: string | null;
  currency: string | null;
  locale: string | null;
}

/**
 * Partial-state delta for the `setRestaurant` action. Resets `lines` when
 * the incoming restaurantId differs from the current one so a cart doesn't
 * leak across tenants.
 */
export function applyRestaurantChange(
  state: Pick<RestaurantScopedCartState, 'restaurantId'>,
  id: string,
  currency: string,
  locale: string,
): Partial<RestaurantScopedCartState> {
  if (state.restaurantId && state.restaurantId !== id) {
    return { restaurantId: id, currency, locale, lines: [] };
  }
  return { restaurantId: id, currency, locale };
}
