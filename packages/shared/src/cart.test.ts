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

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    itemId: 'item-1',
    name: 'Margherita',
    priceMinor: 1200,
    quantity: 1,
    modifiers: [],
    ...overrides,
  };
}

describe('cartLineKey', () => {
  it('derives the same key for modifiers in any order', () => {
    const a = line({
      modifiers: [
        { groupName: 'size', optionName: 'large', priceMinor: 200 },
        { groupName: 'crust', optionName: 'thin', priceMinor: 0 },
      ],
    });
    const b = line({
      modifiers: [
        { groupName: 'crust', optionName: 'thin', priceMinor: 0 },
        { groupName: 'size', optionName: 'large', priceMinor: 200 },
      ],
    });
    expect(cartLineKey(a)).toBe(cartLineKey(b));
  });

  it('includes the item id and modifier pairs in the key', () => {
    expect(cartLineKey(line({ itemId: 'xyz', modifiers: [] }))).toBe('xyz#');
  });
});

describe('cartLineUnitMinor', () => {
  it('sums item price and modifier prices', () => {
    expect(
      cartLineUnitMinor(
        line({
          priceMinor: 1000,
          modifiers: [
            { groupName: 'size', optionName: 'large', priceMinor: 300 },
            { groupName: 'extras', optionName: 'cheese', priceMinor: 100 },
          ],
        }),
      ),
    ).toBe(1400);
  });
});

describe('cartSubtotalMinor', () => {
  it('multiplies unit price by quantity for every line', () => {
    const lines: CartLine[] = [
      line({ itemId: 'a', priceMinor: 500, quantity: 2 }),
      line({
        itemId: 'b',
        priceMinor: 800,
        quantity: 1,
        modifiers: [{ groupName: 'size', optionName: 'large', priceMinor: 200 }],
      }),
    ];
    expect(cartSubtotalMinor(lines)).toBe(500 * 2 + 1000);
  });

  it('returns 0 for an empty cart', () => {
    expect(cartSubtotalMinor([])).toBe(0);
  });
});

describe('cartItemCount', () => {
  it('returns the total quantity across all lines', () => {
    expect(
      cartItemCount([
        { quantity: 2 } as CartLine,
        { quantity: 1 } as CartLine,
        { quantity: 5 } as CartLine,
      ]),
    ).toBe(8);
  });
});

describe('addCartLine', () => {
  it('appends a new line when no matching key exists', () => {
    const result = addCartLine([], { itemId: 'a', name: 'A', priceMinor: 100, modifiers: [] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ itemId: 'a', quantity: 1 });
  });

  it('merges quantity onto an existing matching line (same item + modifiers)', () => {
    const existing = [line({ itemId: 'a', quantity: 2 })];
    const result = addCartLine(existing, {
      itemId: 'a',
      name: 'A',
      priceMinor: 100,
      modifiers: [],
      quantity: 3,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.quantity).toBe(5);
  });

  it('treats different modifier selections as distinct lines', () => {
    const existing = [
      line({
        itemId: 'a',
        modifiers: [{ groupName: 'size', optionName: 'small', priceMinor: 0 }],
      }),
    ];
    const result = addCartLine(existing, {
      itemId: 'a',
      name: 'A',
      priceMinor: 100,
      modifiers: [{ groupName: 'size', optionName: 'large', priceMinor: 200 }],
    });
    expect(result).toHaveLength(2);
  });

  it('defaults quantity to 1 when the input omits it', () => {
    const result = addCartLine([], { itemId: 'a', name: 'A', priceMinor: 100, modifiers: [] });
    expect(result[0]?.quantity).toBe(1);
  });
});

describe('incrementCartLine / decrementCartLine / removeCartLine', () => {
  const lines = [line({ itemId: 'a', quantity: 2 }), line({ itemId: 'b', quantity: 1 })];

  it('incrementCartLine bumps the matching line', () => {
    const key = cartLineKey(lines[0]!);
    const result = incrementCartLine(lines, key);
    expect(result[0]?.quantity).toBe(3);
    expect(result[1]?.quantity).toBe(1);
  });

  it('decrementCartLine decreases and drops lines that hit zero', () => {
    const key = cartLineKey(lines[1]!);
    const result = decrementCartLine(lines, key);
    expect(result).toHaveLength(1);
    expect(result[0]?.itemId).toBe('a');
  });

  it('removeCartLine deletes the matching line', () => {
    const key = cartLineKey(lines[0]!);
    const result = removeCartLine(lines, key);
    expect(result).toHaveLength(1);
    expect(result[0]?.itemId).toBe('b');
  });
});

describe('setCartLineNotes', () => {
  it('replaces notes on the matching line and strips empty strings to undefined', () => {
    const lines = [line({ itemId: 'a', notes: 'first' })];
    const key = cartLineKey(lines[0]!);
    expect(setCartLineNotes(lines, key, 'updated')[0]?.notes).toBe('updated');
    expect(setCartLineNotes(lines, key, '')[0]?.notes).toBeUndefined();
  });
});
