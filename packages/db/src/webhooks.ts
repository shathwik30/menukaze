import { randomBytes } from 'node:crypto';
import type { Connection, Types } from 'mongoose';
import { getModels } from './models/index';

export interface EnqueueEventInput {
  restaurantId: Types.ObjectId;
  eventType: string;
  data: Record<string, unknown>;
}

/**
 * Enqueue a webhook event to every active subscription that listens to it.
 * Best-effort: errors are swallowed because the event source (an order
 * action) is the source of truth, not the webhook fan-out. The worker
 * picks up the resulting `pending` deliveries and drains them.
 *
 * Returns the number of deliveries created so callers can log fan-out
 * counts in development.
 */
export async function enqueueWebhookEvent(
  connection: Connection,
  input: EnqueueEventInput,
): Promise<number> {
  try {
    const { WebhookSubscription, WebhookDelivery } = getModels(connection);
    const subs = await WebhookSubscription.find({
      restaurantId: input.restaurantId,
      enabled: true,
      events: input.eventType,
    })
      .lean()
      .exec();
    if (subs.length === 0) return 0;

    const eventId = `evt_${randomBytes(12).toString('hex')}`;
    const now = new Date();
    const payload = {
      id: eventId,
      type: input.eventType,
      created_at: now.toISOString(),
      restaurant_id: String(input.restaurantId),
      api_version: 'v1',
      data: input.data,
    } satisfies Record<string, unknown>;

    await WebhookDelivery.insertMany(
      subs.map((s) => ({
        restaurantId: input.restaurantId,
        subscriptionId: s._id,
        eventId,
        eventType: input.eventType,
        payload,
        status: 'pending' as const,
        attempts: 0,
        nextAttemptAt: now,
      })),
    );
    return subs.length;
  } catch (error) {
    console.warn('[webhooks] enqueue failed', error);
    return 0;
  }
}
