import type { CartLine, CartLineInput } from './cart';
import { addCartLine, decrementCartLine, incrementCartLine, removeCartLine } from './cart';

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
