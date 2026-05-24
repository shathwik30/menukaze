import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { getModels } from './models';
import { loadMenuProjection } from './menu-projection';
import { startInMemoryMongo, type InMemoryMongo } from './test-utils';

describe('loadMenuProjection', () => {
  let mongo: InMemoryMongo;

  beforeAll(async () => {
    mongo = await startInMemoryMongo();
  });

  afterAll(async () => {
    await mongo.close();
  });

  it('projects published menus through category memberships and preserves membership order', async () => {
    const { connection } = mongo;
    const { Menu, Category, Item, CategoryItemMembership } = getModels(connection);
    const restaurantId = new Types.ObjectId();

    const createdMenus = await Menu.create([
      { restaurantId, name: 'Breakfast', order: 0, status: 'published' },
      { restaurantId, name: 'Draft', order: 1, status: 'draft' },
    ]);
    const breakfastMenu = createdMenus[0]!;
    const draftMenu = createdMenus[1]!;

    const createdCategories = await Category.create([
      { restaurantId, menuId: breakfastMenu._id, name: 'Eggs', order: 0 },
      { restaurantId, menuId: breakfastMenu._id, name: 'Drinks', order: 1 },
      { restaurantId, menuId: draftMenu._id, name: 'Draft category', order: 0 },
    ]);
    const eggs = createdCategories[0]!;
    const drinks = createdCategories[1]!;
    const draftCategory = createdCategories[2]!;

    const createdItems = await Item.create([
      {
        restaurantId,
        categoryId: eggs._id,
        name: 'Coffee',
        priceMinor: 200,
        currency: 'USD',
        modifiers: [],
        dietaryTags: [],
        soldOut: false,
        status: 'published',
      },
      {
        restaurantId,
        categoryId: eggs._id,
        name: 'Omelette',
        priceMinor: 900,
        currency: 'USD',
        modifiers: [],
        dietaryTags: [],
        soldOut: false,
        status: 'published',
      },
      {
        restaurantId,
        categoryId: draftCategory._id,
        name: 'Draft item',
        priceMinor: 500,
        currency: 'USD',
        modifiers: [],
        dietaryTags: [],
        soldOut: false,
        status: 'draft',
      },
    ]);
    const coffee = createdItems[0]!;
    const omelette = createdItems[1]!;
    const hiddenDraft = createdItems[2]!;

    await CategoryItemMembership.create([
      { restaurantId, categoryId: drinks._id, itemId: coffee._id, order: 0 },
      { restaurantId, categoryId: eggs._id, itemId: omelette._id, order: 0 },
      { restaurantId, categoryId: eggs._id, itemId: coffee._id, order: 1 },
    ]);

    const projection = await loadMenuProjection(connection, {
      restaurantId,
      timeZone: 'UTC',
    });

    expect(projection.menus).toHaveLength(1);
    expect(projection.menus[0]?.name).toBe('Breakfast');
    expect(projection.categories.map((category) => category.name)).toEqual(['Eggs', 'Drinks']);
    expect(projection.categories[0]?.items.map((item) => item.name)).toEqual([
      'Omelette',
      'Coffee',
    ]);
    expect(projection.categories[1]?.items.map((item) => item.name)).toEqual(['Coffee']);
    expect(projection.items.find((item) => item.name === 'Coffee')?.primaryCategoryId).toBe(
      String(drinks._id),
    );
    expect(projection.items.some((item) => item.name === hiddenDraft.name)).toBe(false);
  });

  it('filters hidden, channel-restricted, and schedule-inactive items while carrying category descriptions', async () => {
    const { connection } = mongo;
    const { Menu, Category, Item, CategoryItemMembership } = getModels(connection);
    const restaurantId = new Types.ObjectId();

    const [menu] = await Menu.create([
      { restaurantId, name: 'All day', order: 0, status: 'published' },
    ]);
    const [category] = await Category.create([
      {
        restaurantId,
        menuId: menu!._id,
        name: 'Specials',
        description: 'Rotating dishes and timed offers.',
        order: 0,
      },
    ]);

    const [visibleItem, hiddenItem, kioskOnlyItem, breakfastOnlyItem] = await Item.create([
      {
        restaurantId,
        categoryId: category!._id,
        name: 'Visible dish',
        priceMinor: 1000,
        currency: 'USD',
        modifiers: [],
        dietaryTags: [],
        soldOut: false,
        status: 'published',
      },
      {
        restaurantId,
        categoryId: category!._id,
        name: 'Hidden dish',
        priceMinor: 1100,
        currency: 'USD',
        modifiers: [],
        dietaryTags: [],
        soldOut: false,
        status: 'published',
        isHidden: true,
      },
      {
        restaurantId,
        categoryId: category!._id,
        name: 'Kiosk only',
        priceMinor: 1200,
        currency: 'USD',
        modifiers: [],
        dietaryTags: [],
        soldOut: false,
        status: 'published',
        availableFor: ['kiosk'],
      },
      {
        restaurantId,
        categoryId: category!._id,
        name: 'Breakfast only',
        priceMinor: 1300,
        currency: 'USD',
        modifiers: [],
        dietaryTags: [],
        soldOut: false,
        status: 'published',
        schedule: { days: ['mon'], startTime: '08:00', endTime: '10:00' },
      },
    ]);

    await CategoryItemMembership.create([
      { restaurantId, categoryId: category!._id, itemId: visibleItem!._id, order: 0 },
      { restaurantId, categoryId: category!._id, itemId: hiddenItem!._id, order: 1 },
      { restaurantId, categoryId: category!._id, itemId: kioskOnlyItem!._id, order: 2 },
      { restaurantId, categoryId: category!._id, itemId: breakfastOnlyItem!._id, order: 3 },
    ]);

    const projection = await loadMenuProjection(connection, {
      restaurantId,
      timeZone: 'UTC',
      channel: 'storefront',
      now: new Date('2026-05-26T12:00:00.000Z'),
    });

    expect(projection.categories[0]?.description).toBe('Rotating dishes and timed offers.');
    expect(projection.categories[0]?.items.map((item) => item.name)).toEqual(['Visible dish']);
  });

  it('reuses one category across multiple menus when linked through menuIds', async () => {
    const { connection } = mongo;
    const { Menu, Category, Item, CategoryItemMembership } = getModels(connection);
    const restaurantId = new Types.ObjectId();

    const [breakfast, allDay] = await Menu.create([
      { restaurantId, name: 'Breakfast', order: 0, status: 'published' },
      { restaurantId, name: 'All Day', order: 1, status: 'published' },
    ]);
    const category = await Category.create({
      restaurantId,
      menuId: breakfast!._id,
      menuIds: [breakfast!._id, allDay!._id],
      name: 'Shared Sides',
      order: 0,
    });
    const item = await Item.create({
      restaurantId,
      categoryId: category._id,
      name: 'Fries',
      priceMinor: 300,
      currency: 'USD',
      modifiers: [],
      variants: [],
      dietaryTags: [],
      soldOut: false,
      status: 'published',
    });
    await CategoryItemMembership.create({
      restaurantId,
      categoryId: category._id,
      itemId: item._id,
      order: 0,
    });

    const projection = await loadMenuProjection(connection, {
      restaurantId,
      timeZone: 'UTC',
    });

    expect(projection.categories).toHaveLength(1);
    expect(projection.categories[0]?.menuIds).toEqual([
      String(breakfast!._id),
      String(allDay!._id),
    ]);
    expect(projection.menus.find((menu) => menu.name === 'Breakfast')?.categories[0]?.id).toBe(
      String(category._id),
    );
    expect(projection.menus.find((menu) => menu.name === 'All Day')?.categories[0]?.id).toBe(
      String(category._id),
    );
  });
});
