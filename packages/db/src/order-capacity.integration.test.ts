import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getModels } from './models';
import { CAPACITY_ORDER_STATUSES, restaurantHasReachedOrderCapacity } from './order-capacity';
import { startInMemoryMongo, type InMemoryMongo } from './test-utils';

let mongo: InMemoryMongo;
const restaurantId = new Types.ObjectId();

beforeAll(async () => {
  mongo = await startInMemoryMongo();
}, 60_000);

afterEach(async () => {
  const { Order } = getModels(mongo.connection);
  await Order.deleteMany({ restaurantId }).exec();
});

afterAll(async () => {
  await mongo.close();
});

async function createTestOrder(status: string, publicOrderId: string): Promise<void> {
  const { Order } = getModels(mongo.connection);
  await Order.create({
    restaurantId,
    publicOrderId,
    channel: 'storefront',
    type: 'pickup',
    customer: { name: 'Test', email: 'test@example.com' },
    items: [
      {
        itemId: new Types.ObjectId(),
        name: 'Dish',
        priceMinor: 1000,
        quantity: 1,
        modifiers: [],
        lineTotalMinor: 1000,
        lineStatus: 'received',
      },
    ],
    subtotalMinor: 1000,
    taxMinor: 0,
    tipMinor: 0,
    totalMinor: 1000,
    currency: 'USD',
    status,
    statusHistory: [{ status, at: new Date() }],
    payment: {
      gateway: 'razorpay',
      status: 'pending',
      amountMinor: 1000,
      currency: 'USD',
    },
  });
}

describe('restaurantHasReachedOrderCapacity', () => {
  it('returns false when under the limit', async () => {
    await createTestOrder('confirmed', 'MK-AAA001');
    await createTestOrder('preparing', 'MK-AAA002');
    expect(await restaurantHasReachedOrderCapacity(mongo.connection, restaurantId, 5)).toBe(false);
  });

  it('returns true when the active order count meets the cap', async () => {
    await createTestOrder('confirmed', 'MK-BBB001');
    await createTestOrder('preparing', 'MK-BBB002');
    await createTestOrder('ready', 'MK-BBB003');
    expect(await restaurantHasReachedOrderCapacity(mongo.connection, restaurantId, 3)).toBe(true);
  });

  it('excludes terminal statuses (completed, cancelled) and initial received from the count', async () => {
    await createTestOrder('completed', 'MK-CCC001');
    await createTestOrder('cancelled', 'MK-CCC002');
    await createTestOrder('received', 'MK-CCC003');
    expect(await restaurantHasReachedOrderCapacity(mongo.connection, restaurantId, 1)).toBe(false);
  });

  it('treats non-positive caps as "no limit"', async () => {
    await createTestOrder('preparing', 'MK-DDD001');
    expect(await restaurantHasReachedOrderCapacity(mongo.connection, restaurantId, 0)).toBe(false);
    expect(await restaurantHasReachedOrderCapacity(mongo.connection, restaurantId, -5)).toBe(false);
  });

  it('CAPACITY_ORDER_STATUSES covers the in-flight states operators care about', () => {
    expect(CAPACITY_ORDER_STATUSES).toEqual([
      'confirmed',
      'preparing',
      'ready',
      'served',
      'out_for_delivery',
      'delivered',
    ]);
  });
});
