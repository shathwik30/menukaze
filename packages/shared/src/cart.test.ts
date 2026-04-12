import { describe, expect, it } from 'vitest';
import {
  addCartLine,
  cartItemCount,
  cartLineKey,
  cartLineUnitMinor,
  cartSubtotalMinor,
  decrementCartLine,
  incrementCartLine,
  removeCartLine,
  setCartLineNotes,
  type CartLine,
} from './cart';

const burgerLine: CartLine = {
  itemId: 'burger',
  name: 'Burger',
  priceMinor: 250,
  quantity: 1,
  modifiers: [
    { groupName: 'Sauce', optionName: 'Peri Peri', priceMinor: 25 },
    { groupName: 'Cheese', optionName: 'Cheddar', priceMinor: 40 },
  ],
};

describe('cart helpers', () => {
  it('builds a stable line key regardless of modifier order', () => {
    const reversed = {
      ...burgerLine,
      modifiers: [...burgerLine.modifiers].reverse(),
    };

    expect(cartLineKey(burgerLine)).toBe(cartLineKey(reversed));
  });

  it('merges repeated lines and updates counts', () => {
    const key = cartLineKey(burgerLine);
    const lines = addCartLine([], burgerLine);
    const merged = addCartLine(lines, { ...burgerLine, quantity: 2 });

    expect(merged).toEqual([{ ...burgerLine, quantity: 3 }]);
    expect(incrementCartLine(merged, key)).toEqual([{ ...burgerLine, quantity: 4 }]);
    expect(decrementCartLine([{ ...burgerLine, quantity: 2 }], key)).toEqual([
      { ...burgerLine, quantity: 1 },
    ]);
  });

  it('removes empty lines and clears notes when blank', () => {
    const key = cartLineKey(burgerLine);
    const withNotes = setCartLineNotes([{ ...burgerLine, notes: 'No onions' }], key, '');

    expect(withNotes).toEqual([{ ...burgerLine }]);
    expect(removeCartLine(withNotes, key)).toEqual([]);
    expect(decrementCartLine([{ ...burgerLine, quantity: 1 }], key)).toEqual([]);
  });

  it('computes line totals and item counts', () => {
    const fries: CartLine = {
      itemId: 'fries',
      name: 'Fries',
      priceMinor: 120,
      quantity: 2,
      modifiers: [],
    };

    expect(cartLineUnitMinor(burgerLine)).toBe(315);
    expect(cartSubtotalMinor([burgerLine, fries])).toBe(555);
    expect(cartItemCount([burgerLine, fries])).toBe(3);
  });
});
