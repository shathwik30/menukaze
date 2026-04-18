'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { generateWebhookSecret, getModels, getMongoConnection } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { WEBHOOK_EVENT_TYPES } from '@menukaze/shared';
import {
  invalidEntityError,
  runRestaurantAction,
  validationError,
  type ActionResult,
} from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const PERMISSION_ERROR = 'You do not have permission to manage webhooks.';

const createInput = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).max(WEBHOOK_EVENT_TYPES.length),
  description: z.string().max(200).optional(),
});

export interface CreatedSubscription {
  id: string;
  secret: string;
}

export async function createWebhookSubscriptionAction(
  raw: unknown,
): Promise<ActionResult<CreatedSubscription>> {
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  return runRestaurantAction(
    ['webhooks.manage'],
    { onError: 'Failed to create webhook subscription.', onForbidden: PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { WebhookSubscription } = getModels(conn);
      const secret = generateWebhookSecret();
      const created = await WebhookSubscription.create({
        restaurantId,
        url: parsed.data.url,
        events: parsed.data.events,
        secret,
        enabled: true,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        createdByUserId: parseObjectId(session.user.id) ?? undefined,
      });
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'webhook.subscription.created',
        resourceType: 'webhook_subscription',
        resourceId: String(created._id),
        metadata: { url: parsed.data.url, events: parsed.data.events },
      });
      revalidatePath('/admin/webhooks');
      return { ok: true, data: { id: String(created._id), secret } };
    },
  );
}

export async function toggleWebhookSubscriptionAction(
  subscriptionId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const subObjectId = parseObjectId(subscriptionId);
  if (!subObjectId) return invalidEntityError('subscription');
  return runRestaurantAction(
    ['webhooks.manage'],
    { onError: 'Failed to toggle subscription.', onForbidden: PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { WebhookSubscription } = getModels(conn);
      await WebhookSubscription.updateOne(
        { restaurantId, _id: subObjectId },
        { $set: { enabled } },
      ).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: enabled ? 'webhook.subscription.enabled' : 'webhook.subscription.disabled',
        resourceType: 'webhook_subscription',
        resourceId: subscriptionId,
      });
      revalidatePath('/admin/webhooks');
      return { ok: true };
    },
  );
}

export async function deleteWebhookSubscriptionAction(
  subscriptionId: string,
): Promise<ActionResult> {
  const subObjectId = parseObjectId(subscriptionId);
  if (!subObjectId) return invalidEntityError('subscription');
  return runRestaurantAction(
    ['webhooks.manage'],
    { onError: 'Failed to delete subscription.', onForbidden: PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { WebhookSubscription } = getModels(conn);
      await WebhookSubscription.deleteOne({ restaurantId, _id: subObjectId }).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'webhook.subscription.deleted',
        resourceType: 'webhook_subscription',
        resourceId: subscriptionId,
      });
      revalidatePath('/admin/webhooks');
      return { ok: true };
    },
  );
}

const testInput = z.object({ subscriptionId: z.string().min(1) });

export async function sendTestWebhookAction(raw: unknown): Promise<ActionResult> {
  const parsed = testInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const subObjectId = parseObjectId(parsed.data.subscriptionId);
  if (!subObjectId) return invalidEntityError('subscription');

  return runRestaurantAction(
    ['webhooks.manage'],
    { onError: 'Failed to enqueue test webhook.', onForbidden: PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { WebhookSubscription, WebhookDelivery } = getModels(conn);
      const subscription = await WebhookSubscription.findOne({
        restaurantId,
        _id: subObjectId,
      }).exec();
      if (!subscription) throw new Error('Subscription not found.');
      if (!subscription.enabled) throw new Error('This subscription is disabled.');

      const now = new Date();
      const eventId = `evt_test_${Date.now().toString(16)}`;
      await WebhookDelivery.create({
        restaurantId,
        subscriptionId: subscription._id,
        eventId,
        eventType: 'webhook.test',
        payload: {
          id: eventId,
          type: 'webhook.test',
          created_at: now.toISOString(),
          restaurant_id: String(restaurantId),
          api_version: 'v1',
          data: { message: 'This is a test webhook from Menukaze.' },
        },
        status: 'pending',
        attempts: 0,
        nextAttemptAt: now,
      });
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'webhook.test.enqueued',
        resourceType: 'webhook_subscription',
        resourceId: String(subscription._id),
        metadata: { eventId },
      });
      revalidatePath('/admin/webhooks');
      return { ok: true };
    },
  );
}

export async function retryWebhookDeliveryAction(deliveryId: string): Promise<ActionResult> {
  const deliveryObjectId = parseObjectId(deliveryId);
  if (!deliveryObjectId) return invalidEntityError('delivery');
  return runRestaurantAction(
    ['webhooks.manage'],
    { onError: 'Failed to retry delivery.', onForbidden: PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { WebhookDelivery } = getModels(conn);
      const result = await WebhookDelivery.updateOne(
        { restaurantId, _id: deliveryObjectId, status: { $in: ['failed', 'pending'] } },
        { $set: { status: 'pending', nextAttemptAt: new Date(), attempts: 0 } },
      ).exec();
      if (result.matchedCount !== 1) throw new Error('Delivery not found.');
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'webhook.delivery.retried',
        resourceType: 'webhook_delivery',
        resourceId: String(deliveryObjectId),
      });
      revalidatePath('/admin/webhooks');
      return { ok: true };
    },
  );
}
