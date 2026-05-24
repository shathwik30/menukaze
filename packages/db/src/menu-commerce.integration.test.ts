import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { buildMenuCommercePricing } from './menu-commerce';
import { getModels } from './models';
import { startInMemoryMongo, type InMemoryMongo } from './test-utils';

describe('buildMenuCommercePricing', () => {
  let mongo: InMemoryMongo;

  beforeAll(async () => {
    mongo = await startInMemoryMongo();
  });

  afterAll(async () => {
    await mongo.close();
  });

  it('prices selected variants, validates modifiers, and applies tax classes', async () => {
    const { connection } = mongo;
    const { Menu, Category, Item, CategoryItemMembership } = getModels(connection);
    const restaurantId = new Types.ObjectId();

    const menu = await Menu.create({ restaurantId, name: 'Main', order: 0, status: 'published' });
    const category = await Category.create({
      restaurantId,
      menuId: menu._id,
      name: 'Burgers',
      order: 0,
    });
    const item = await Item.create({
      restaurantId,
      categoryId: category._id,
      name: 'Classic Burger',
      priceMinor: 700,
      currency: 'USD',
      dietaryTags: [],
      allergens: ['milk', 'tree_nuts'],
      soldOut: false,
      status: 'published',
      taxClassId: 'food',
      modifiers: [
        {
          name: 'Cheese',
          min: 1,
          max: 1,
          options: [
            { name: 'Cheddar', priceMinor: 50 },
            { name: 'Swiss', priceMinor: 75 },
          ],
        },
      ],
      variants: [
        { name: 'Single', priceMinor: 700, order: 0, isDefault: true, soldOut: false },
        { name: 'Double', priceMinor: 950, order: 1, isDefault: false, soldOut: false },
      ],
    });
    await CategoryItemMembership.create([
      { restaurantId, categoryId: category._id, itemId: item._id, order: 0 },
    ]);

    const doubleVariantId = String(item.variants[1]!._id);
    const pricing = await buildMenuCommercePricing({
      connection,
      restaurantId,
      restaurant: {
        currency: 'USD',
        timezone: 'UTC',
        estimatedPrepMinutes: 12,
        taxRules: [{ name: 'Order service fee', percent: 5, inclusive: false, scope: 'order' }],
        taxClasses: [
          {
            id: 'food',
            name: 'Food tax',
            rules: [{ name: 'Food GST', percent: 10, inclusive: false, scope: 'item' }],
          },
        ],
      },
      channel: 'walk_in',
      lines: [
        {
          itemId: String(item._id),
          variantId: doubleVariantId,
          quantity: 2,
          modifiers: [{ groupName: 'Cheese', optionName: 'Swiss' }],
        },
      ],
    });

    expect('error' in pricing).toBe(false);
    if ('error' in pricing) return;

    expect(pricing.subtotalMinor).toBe(2050);
    expect(pricing.taxMinor).toBe(308);
    expect(pricing.surchargeMinor).toBe(308);
    expect(pricing.prepMinutes).toBe(12);
    expect(pricing.snapshotLines).toHaveLength(1);
    expect(pricing.snapshotLines[0]).toMatchObject({
      name: 'Classic Burger',
      priceMinor: 950,
      quantity: 2,
      variantName: 'Double',
      taxClassId: 'food',
      taxClassName: 'Food tax',
      taxMinor: 205,
      lineTotalMinor: 2050,
    });
  });

  it('rejects items that are not available for the ordering channel', async () => {
    const { connection } = mongo;
    const { Category, Item, Menu, CategoryItemMembership } = getModels(connection);
    const restaurantId = new Types.ObjectId();

    const menu = await Menu.create({ restaurantId, name: 'Main', order: 0, status: 'published' });
    const category = await Category.create({
      restaurantId,
      menuId: menu._id,
      name: 'Desserts',
      order: 0,
    });
    const item = await Item.create({
      restaurantId,
      categoryId: category._id,
      name: 'Delivery Sundae',
      priceMinor: 450,
      currency: 'USD',
      dietaryTags: [],
      soldOut: false,
      status: 'published',
      modifiers: [],
      variants: [],
      availableFor: ['storefront'],
    });
    await CategoryItemMembership.create([
      { restaurantId, categoryId: category._id, itemId: item._id, order: 0 },
    ]);

    const pricing = await buildMenuCommercePricing({
      connection,
      restaurantId,
      restaurant: { currency: 'USD', timezone: 'UTC' },
      channel: 'walk_in',
      lines: [{ itemId: String(item._id), quantity: 1, modifiers: [] }],
    });

    expect(pricing).toEqual({ error: 'Delivery Sundae is unavailable.' });
  });
});
