import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getModels } from './models';
import { TenantContextMissingError } from './plugins/tenant-scoped';
import { startInMemoryMongo, type InMemoryMongo } from './test-utils';

let mongo: InMemoryMongo;

beforeAll(async () => {
  mongo = await startInMemoryMongo();
}, 60_000);

afterAll(async () => {
  await mongo.close();
});

describe('tenantScopedPlugin', () => {
  it('throws when a tenant-scoped query is missing restaurantId', async () => {
    const { Item } = getModels(mongo.connection);
    await expect(Item.find({}).exec()).rejects.toBeInstanceOf(TenantContextMissingError);
  });

  it('throws when restaurantId is explicitly null', async () => {
    const { Item } = getModels(mongo.connection);
    await expect(Item.find({ restaurantId: null }).exec()).rejects.toBeInstanceOf(
      TenantContextMissingError,
    );
  });

  it('allows queries that carry restaurantId', async () => {
    const { Item } = getModels(mongo.connection);
    const result = await Item.find({ restaurantId: new Types.ObjectId() }).exec();
    expect(result).toEqual([]);
  });

  it('respects skipTenantGuard for intentional cross-tenant reads', async () => {
    const { Item } = getModels(mongo.connection);
    const result = await Item.find({}, null, { skipTenantGuard: true }).exec();
    expect(result).toEqual([]);
  });

  it('throws on aggregate without a restaurantId $match', async () => {
    const { Item } = getModels(mongo.connection);
    await expect(Item.aggregate([{ $match: {} }]).exec()).rejects.toBeInstanceOf(
      TenantContextMissingError,
    );
  });

  it('allows aggregate when the first stage filters by restaurantId', async () => {
    const { Item } = getModels(mongo.connection);
    const result = await Item.aggregate([
      { $match: { restaurantId: new Types.ObjectId() } },
    ]).exec();
    expect(result).toEqual([]);
  });
});
