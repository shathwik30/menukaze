/**
 * Integration test for the tenant-scoped plugin.
 *
 * Boots an in-memory Mongo replset (mongodb-memory-server), inserts staff
 * memberships for two restaurants, and verifies:
 *
 *   1. A query without restaurantId throws TenantContextMissingError.
 *   2. createTenantRepo bound to restaurant A only sees A's data.
 *   3. The escape hatch { skipTenantGuard: true } returns rows from both.
 *   4. Cross-tenant `aggregate` is also blocked.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types, type Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createConnectionFromUri } from './client';
import { getModels, generateQrToken } from './models/index';
import { createTenantRepo } from './repos/create-tenant-repo';
import { TenantContextMissingError } from './plugins/tenant-scoped';

let replset: MongoMemoryReplSet;
let connection: Connection;

const restaurantA = new Types.ObjectId().toHexString();
const restaurantB = new Types.ObjectId().toHexString();

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  connection = await createConnectionFromUri(replset.getUri(), 'menukaze_test');
  // Force model registration so indexes get built.
  const models = getModels(connection);
  await models.StaffMembership.init();

  // Seed two memberships, one per restaurant.
  await models.StaffMembership.create({
    restaurantId: new Types.ObjectId(restaurantA),
    userId: new Types.ObjectId(),
    role: 'owner',
    status: 'active',
  });
  await models.StaffMembership.create({
    restaurantId: new Types.ObjectId(restaurantB),
    userId: new Types.ObjectId(),
    role: 'waiter',
    status: 'active',
  });
}, 90_000);

afterAll(async () => {
  await connection.close();
  await replset.stop();
});

describe('tenantScopedPlugin', () => {
  it('throws when a tenant-scoped query has no restaurantId', async () => {
    const { StaffMembership } = getModels(connection);
    await expect(StaffMembership.find({}).exec()).rejects.toBeInstanceOf(TenantContextMissingError);
  });

  it('allows the bypass option { skipTenantGuard: true }', async () => {
    const { StaffMembership } = getModels(connection);
    const all = await StaffMembership.find({}, null, { skipTenantGuard: true }).exec();
    expect(all.length).toBe(2);
  });

  it('blocks an aggregate without $match { restaurantId } at stage 0', async () => {
    const { StaffMembership } = getModels(connection);
    await expect(
      StaffMembership.aggregate([{ $match: { role: 'owner' } }]).exec(),
    ).rejects.toBeInstanceOf(TenantContextMissingError);
  });
});

describe('createTenantRepo', () => {
  it('isolates reads to the bound restaurant', async () => {
    const { StaffMembership } = getModels(connection);
    const repoA = createTenantRepo(StaffMembership, restaurantA);
    const repoB = createTenantRepo(StaffMembership, restaurantB);

    const aRows = await repoA.find().exec();
    const bRows = await repoB.find().exec();

    expect(aRows.length).toBe(1);
    expect(bRows.length).toBe(1);
    expect(aRows[0]?.role).toBe('owner');
    expect(bRows[0]?.role).toBe('waiter');
  });

  it('forces restaurantId on create even if the caller passes a different value', async () => {
    const { StaffMembership } = getModels(connection);
    const repoA = createTenantRepo(StaffMembership, restaurantA);
    const created = await repoA.create({
      // Caller tries to claim tenant B; repo MUST overwrite this with tenant A.
      restaurantId: new Types.ObjectId(restaurantB),
      userId: new Types.ObjectId(),
      role: 'manager',
      status: 'active',
    });
    expect(String(created.restaurantId)).toBe(restaurantA);
  });

  it('count is also tenant-scoped', async () => {
    const { StaffMembership } = getModels(connection);
    const repoA = createTenantRepo(StaffMembership, restaurantA);
    // After the previous test we expect 2 docs in tenant A (initial owner + new manager).
    const count = await repoA.countDocuments();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe('Menu / Category / Item models', () => {
  it('all three new models enforce the tenant guard', async () => {
    const { Menu, Category, Item } = getModels(connection);
    await expect(Menu.find({}).exec()).rejects.toBeInstanceOf(TenantContextMissingError);
    await expect(Category.find({}).exec()).rejects.toBeInstanceOf(TenantContextMissingError);
    await expect(Item.find({}).exec()).rejects.toBeInstanceOf(TenantContextMissingError);
  });

  it('createTenantRepo isolates a Menu → Category → Item chain to one restaurant', async () => {
    const { Menu, Category, Item } = getModels(connection);

    // Seed: tenant A gets a menu with one category + one item.
    const menuRepoA = createTenantRepo(Menu, restaurantA);
    const menuA = await menuRepoA.create({ name: 'Lunch', order: 0 });

    const categoryRepoA = createTenantRepo(Category, restaurantA);
    const categoryA = await categoryRepoA.create({
      menuId: menuA._id,
      name: 'Mains',
      order: 0,
    });

    const itemRepoA = createTenantRepo(Item, restaurantA);
    await itemRepoA.create({
      categoryId: categoryA._id,
      name: 'Margherita Pizza',
      priceMinor: 1299,
      currency: 'USD',
      dietaryTags: ['vegetarian'],
      modifiers: [],
      soldOut: false,
    });

    // Tenant B sees nothing in any of the three collections.
    expect(await createTenantRepo(Menu, restaurantB).countDocuments()).toBe(0);
    expect(await createTenantRepo(Category, restaurantB).countDocuments()).toBe(0);
    expect(await createTenantRepo(Item, restaurantB).countDocuments()).toBe(0);

    // Tenant A sees its own seeded chain.
    expect(await menuRepoA.countDocuments()).toBe(1);
    expect(await categoryRepoA.countDocuments()).toBe(1);
    expect(await itemRepoA.countDocuments()).toBe(1);
  });

  it('Table model enforces the tenant guard and unique qrToken', async () => {
    const { Table } = getModels(connection);

    // Guard fires on bare find
    await expect(Table.find({}).exec()).rejects.toBeInstanceOf(TenantContextMissingError);

    const repoA = createTenantRepo(Table, restaurantA);
    await repoA.create({
      number: 1,
      name: 'Table 1',
      capacity: 4,
      qrToken: generateQrToken(),
      status: 'available',
    });
    await repoA.create({
      number: 2,
      name: 'Table 2',
      capacity: 2,
      qrToken: generateQrToken(),
      status: 'available',
    });

    // Tenant A sees 2 tables, Tenant B sees 0
    expect(await repoA.countDocuments()).toBe(2);
    expect(await createTenantRepo(Table, restaurantB).countDocuments()).toBe(0);
  });

  it('generateQrToken returns unique 24-char URL-safe strings', () => {
    const a = generateQrToken();
    const b = generateQrToken();
    expect(a.length).toBe(24);
    expect(b.length).toBe(24);
    expect(a).not.toBe(b);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });

  it('item modifier groups are persisted as embedded subdocuments', async () => {
    const { Menu, Category, Item } = getModels(connection);
    const menuRepoA = createTenantRepo(Menu, restaurantA);
    const menu = await menuRepoA.create({ name: 'Modifier Menu', order: 1 });
    const categoryRepoA = createTenantRepo(Category, restaurantA);
    const category = await categoryRepoA.create({ menuId: menu._id, name: 'Burgers', order: 0 });
    const itemRepoA = createTenantRepo(Item, restaurantA);

    const created = await itemRepoA.create({
      categoryId: category._id,
      name: 'Cheeseburger',
      priceMinor: 1500,
      currency: 'USD',
      dietaryTags: [],
      modifiers: [
        {
          name: 'Patty',
          required: true,
          max: 1,
          options: [
            { name: 'Single', priceMinor: 0 },
            { name: 'Double', priceMinor: 300 },
          ],
        },
      ],
      soldOut: false,
    });

    expect(created.modifiers.length).toBe(1);
    expect(created.modifiers[0]?.options.length).toBe(2);
    expect(created.modifiers[0]?.options[1]?.priceMinor).toBe(300);
  });
});
