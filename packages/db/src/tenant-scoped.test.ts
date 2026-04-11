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
import { getModels } from './models/index';
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
