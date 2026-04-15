'use server';

import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { getZodErrorMessage } from '@menukaze/shared/validation';

const feedbackInput = z.object({
  orderId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export type SubmitFeedbackResult = { ok: true } | { ok: false; error: string };

export async function submitFeedbackAction(raw: unknown): Promise<SubmitFeedbackResult> {
  const parsed = feedbackInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: getZodErrorMessage(parsed.error, 'Invalid feedback.') };
  }
  const orderObjectId = parseObjectId(parsed.data.orderId);
  if (!orderObjectId) return { ok: false, error: 'Unknown order.' };

  const conn = await getMongoConnection('live');
  const { Order, Feedback } = getModels(conn);

  const order = await Order.findOne({ _id: orderObjectId }, null, { skipTenantGuard: true })
    .lean()
    .exec();
  if (!order) return { ok: false, error: 'Order not found.' };

  const existing = await Feedback.findOne({
    restaurantId: order.restaurantId,
    orderId: orderObjectId,
  })
    .lean()
    .exec();
  if (existing) {
    return { ok: false, error: 'You have already submitted feedback for this order.' };
  }

  await Feedback.create({
    restaurantId: order.restaurantId,
    orderId: orderObjectId,
    rating: parsed.data.rating,
    ...(parsed.data.comment ? { comment: parsed.data.comment } : {}),
    ...(order.customer.email ? { customerEmail: order.customer.email } : {}),
    ...(order.customer.name ? { customerName: order.customer.name } : {}),
  });

  return { ok: true };
}
