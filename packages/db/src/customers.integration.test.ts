import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { upsertCustomerFromOrder } from './customers';
import { getModels } from './models';
import { startInMemoryMongo, type InMemoryMongo } from './test-utils';

let mongo: InMemoryMongo;
const restaurantId = new Types.ObjectId();

beforeAll(async () => {
  mongo = await startInMemoryMongo();
}, 60_000);

afterEach(async () => {
  const { Customer } = getModels(mongo.connection);
  await Customer.deleteMany({ restaurantId }).exec();
});

afterAll(async () => {
  await mongo.close();
});

describe('upsertCustomerFromOrder', () => {
  it('inserts a new customer on first order and stamps firstChannel + firstOrderAt', async () => {
    const occurredAt = new Date('2026-04-01T10:00:00Z');
    await upsertCustomerFromOrder(mongo.connection, {
      restaurantId,
      email: 'Alice@Example.com',
      name: 'Alice',
      channel: 'storefront',
      totalMinor: 2500,
      currency: 'USD',
      occurredAt,
    });

    const { Customer } = getModels(mongo.connection);
    const row = await Customer.findOne({ restaurantId, email: 'alice@example.com' }).lean().exec();
    expect(row).not.toBeNull();
    expect(row?.firstChannel).toBe('storefront');
    expect(row?.firstOrderAt.toISOString()).toBe(occurredAt.toISOString());
    expect(row?.lifetimeOrders).toBe(1);
    expect(row?.lifetimeRevenueMinor).toBe(2500);
    expect(row?.channelCounts.storefront).toBe(1);
  });

  it('increments counters on repeat orders without touching firstChannel', async () => {
    const first = new Date('2026-04-01T10:00:00Z');
    const second = new Date('2026-04-02T11:00:00Z');
    await upsertCustomerFromOrder(mongo.connection, {
      restaurantId,
      email: 'bob@example.com',
      channel: 'storefront',
      totalMinor: 1000,
      currency: 'USD',
      occurredAt: first,
    });
    await upsertCustomerFromOrder(mongo.connection, {
      restaurantId,
      email: 'bob@example.com',
      channel: 'qr_dinein',
      totalMinor: 1500,
      currency: 'USD',
      occurredAt: second,
    });

    const { Customer } = getModels(mongo.connection);
    const row = await Customer.findOne({ restaurantId, email: 'bob@example.com' }).lean().exec();
    expect(row?.firstChannel).toBe('storefront');
    expect(row?.firstOrderAt.toISOString()).toBe(first.toISOString());
    expect(row?.lastOrderAt.toISOString()).toBe(second.toISOString());
    expect(row?.lifetimeOrders).toBe(2);
    expect(row?.lifetimeRevenueMinor).toBe(2500);
    expect(row?.channelCounts.storefront).toBe(1);
    expect(row?.channelCounts.qr_dinein).toBe(1);
  });

  it('normalises email to lowercase', async () => {
    await upsertCustomerFromOrder(mongo.connection, {
      restaurantId,
      email: 'Mixed@Example.COM',
      channel: 'kiosk',
      totalMinor: 500,
      currency: 'USD',
    });
    const { Customer } = getModels(mongo.connection);
    const row = await Customer.findOne({ restaurantId, email: 'mixed@example.com' }).lean().exec();
    expect(row?.email).toBe('mixed@example.com');
  });
});
