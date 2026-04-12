import { describe, expect, it } from 'vitest';
import { parseMenuCsvImport } from './menu-import';

describe('parseMenuCsvImport', () => {
  it('groups rows by category when a header is present', () => {
    const result = parseMenuCsvImport(`item,price,category,description
Margherita,12.5,Pizza,Classic tomato
Pepperoni,14,Pizza,Spicy salami
Tiramisu,8.25,Dessert,Coffee cream`);

    expect(result).toEqual([
      {
        name: 'Pizza',
        items: [
          { name: 'Margherita', priceMajor: 12.5, description: 'Classic tomato' },
          { name: 'Pepperoni', priceMajor: 14, description: 'Spicy salami' },
        ],
      },
      {
        name: 'Dessert',
        items: [{ name: 'Tiramisu', priceMajor: 8.25, description: 'Coffee cream' }],
      },
    ]);
  });

  it('supports headerless csv and falls back to the default category', () => {
    const result = parseMenuCsvImport(
      `Espresso,3.5
Latte,4.25`,
      'Drinks',
    );

    expect(result).toEqual([
      {
        name: 'Drinks',
        items: [
          { name: 'Espresso', priceMajor: 3.5 },
          { name: 'Latte', priceMajor: 4.25 },
        ],
      },
    ]);
  });

  it('throws on invalid prices', () => {
    expect(() =>
      parseMenuCsvImport(`item,price
Burger,abc`),
    ).toThrow(/Row 2: price must be a valid non-negative number/);
  });

  it('handles quoted commas', () => {
    const result = parseMenuCsvImport(`item,price,category,description
"Fish, Chips",14.5,Mains,"Salt, vinegar"`).at(0);

    expect(result).toEqual({
      name: 'Mains',
      items: [{ name: 'Fish, Chips', priceMajor: 14.5, description: 'Salt, vinegar' }],
    });
  });
});
