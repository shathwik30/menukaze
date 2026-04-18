import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getModels } from './models';
import { startInMemoryMongo, type InMemoryMongo } from './test-utils';
import { enqueueWebhookEvent } from './webhooks';

let mongo: InMemoryMongo;
const restaurantId = new Types.ObjectId();

beforeAll(async () => {
  mongo = await startInMemoryMongo();
}, 60_000);

afterEach(async () => {
  const { WebhookSubscription, WebhookDelivery } = getModels(mongo.connection);
  await WebhookSubscription.deleteMany({ restaurantId }).exec();
  await WebhookDelivery.deleteMany({ restaurantId }).exec();
});

afterAll(async () => {
  await mongo.close();
});

describe('enqueueWebhookEvent', () => {
  it('creates one delivery per enabled subscription that listens to the event', async () => {
    const { WebhookSubscription, WebhookDelivery } = getModels(mongo.connection);
    await WebhookSubscription.insertMany([
      {
        restaurantId,
        url: 'https://a.example.com/hook',
        events: ['order.created'],
        secret: 'whsec_a',
        enabled: true,
      },
      {
        restaurantId,
        url: 'https://b.example.com/hook',
        events: ['order.created', 'order.cancelled'],
        secret: 'whsec_b',
        enabled: true,
      },
      {
        restaurantId,
        url: 'https://c.example.com/hook',
        events: ['order.created'],
        secret: 'whsec_c',
        enabled: false,
      },
      {
        restaurantId,
        url: 'https://d.example.com/hook',
        events: ['order.cancelled'],
        secret: 'whsec_d',
        enabled: true,
      },
    ]);

    const created = await enqueueWebhookEvent(mongo.connection, {
      restaurantId,
      eventType: 'order.created',
      data: { id: 'order-123', total_minor: 1000, currency: 'USD' },
    });

    expect(created).toBe(2);
    const deliveries = await WebhookDelivery.find({ restaurantId }).lean().exec();
    expect(deliveries).toHaveLength(2);
    for (const delivery of deliveries) {
      expect(delivery.status).toBe('pending');
      expect(delivery.attempts).toBe(0);
      expect(delivery.eventType).toBe('order.created');
      expect(delivery.payload).toMatchObject({
        type: 'order.created',
        api_version: 'v1',
        data: { id: 'order-123' },
      });
    }
  });

  it('returns 0 and creates no deliveries when no subscription matches', async () => {
    const { WebhookSubscription, WebhookDelivery } = getModels(mongo.connection);
    await WebhookSubscription.create({
      restaurantId,
      url: 'https://x.example.com/hook',
      events: ['reservation.created'],
      secret: 'whsec_x',
      enabled: true,
    });

    const created = await enqueueWebhookEvent(mongo.connection, {
      restaurantId,
      eventType: 'order.created',
      data: { id: 'order-nomatch' },
    });

    expect(created).toBe(0);
    expect(await WebhookDelivery.countDocuments({ restaurantId }).exec()).toBe(0);
  });
});
