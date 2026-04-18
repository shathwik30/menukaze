'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getModels, getMongoConnection } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { captureException } from '@menukaze/monitoring';
import { channels, type OrderStatus } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import { deriveOrderStage, type OrderLineStatus } from '@menukaze/shared';
import {
  invalidEntityError,
  runRestaurantAction,
  validationError,
  type ActionResult,
} from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const KDS_PERMISSION_ERROR = 'You do not have permission to update orders on the KDS.';
const STATION_PERMISSION_ERROR = 'You do not have permission to configure stations.';

const createStationInput = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().max(32).optional(),
  soundEnabled: z.boolean().default(true),
});

export async function createStationAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createStationInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  return runRestaurantAction(
    ['kds.configure'],
    { onError: 'Failed to create station.', onForbidden: STATION_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Station } = getModels(conn);
      const count = await Station.countDocuments({ restaurantId, archived: false }).exec();
      const station = await Station.create({
        restaurantId,
        name: parsed.data.name,
        ...(parsed.data.color ? { color: parsed.data.color } : {}),
        soundEnabled: parsed.data.soundEnabled,
        order: count,
      });
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'station.created',
        resourceType: 'station',
        resourceId: String(station._id),
        metadata: { name: parsed.data.name, order: count },
      });
      revalidatePath('/admin/stations');
      revalidatePath('/admin/kds');
      return { ok: true, data: { id: String(station._id) } };
    },
  );
}

const updateStationInput = z.object({
  stationId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().max(32).optional(),
  soundEnabled: z.boolean().optional(),
});

export async function updateStationAction(raw: unknown): Promise<ActionResult> {
  const parsed = updateStationInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const stationObjectId = parseObjectId(parsed.data.stationId);
  if (!stationObjectId) return invalidEntityError('station');

  return runRestaurantAction(
    ['kds.configure'],
    { onError: 'Failed to update station.', onForbidden: STATION_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Station } = getModels(conn);
      const update: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) update.name = parsed.data.name;
      if (parsed.data.color !== undefined) update.color = parsed.data.color;
      if (parsed.data.soundEnabled !== undefined) update.soundEnabled = parsed.data.soundEnabled;
      if (Object.keys(update).length === 0) return { ok: true };
      await Station.updateOne({ restaurantId, _id: stationObjectId }, { $set: update }).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'station.updated',
        resourceType: 'station',
        resourceId: String(stationObjectId),
        metadata: { fields: Object.keys(update) },
      });
      revalidatePath('/admin/stations');
      return { ok: true };
    },
  );
}

export async function archiveStationAction(stationId: string): Promise<ActionResult> {
  const stationObjectId = parseObjectId(stationId);
  if (!stationObjectId) return invalidEntityError('station');
  return runRestaurantAction(
    ['kds.configure'],
    { onError: 'Failed to archive station.', onForbidden: STATION_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Station } = getModels(conn);
      await Station.updateOne(
        { restaurantId, _id: stationObjectId },
        { $set: { archived: true } },
      ).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'station.archived',
        resourceType: 'station',
        resourceId: String(stationObjectId),
      });
      revalidatePath('/admin/stations');
      return { ok: true };
    },
  );
}

const setItemStationsInput = z.object({
  itemId: z.string().min(1),
  stationIds: z.array(z.string()).max(20),
});

export async function setItemStationsAction(raw: unknown): Promise<ActionResult> {
  const parsed = setItemStationsInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const itemObjectId = parseObjectId(parsed.data.itemId);
  if (!itemObjectId) return invalidEntityError('item');
  const stationObjectIds = parsed.data.stationIds
    .map((id) => parseObjectId(id))
    .filter((id): id is NonNullable<typeof id> => Boolean(id));

  return runRestaurantAction(
    ['kds.configure'],
    { onError: 'Failed to update item routing.', onForbidden: STATION_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Item } = getModels(conn);
      const update =
        stationObjectIds.length > 0
          ? { $set: { stationIds: stationObjectIds } }
          : { $unset: { stationIds: 1 } };
      await Item.updateOne({ restaurantId, _id: itemObjectId }, update).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'station.item_routing.updated',
        resourceType: 'item',
        resourceId: String(itemObjectId),
        metadata: { stationCount: stationObjectIds.length },
      });
      revalidatePath('/admin/menu');
      return { ok: true };
    },
  );
}

const advanceLineInput = z.object({
  orderId: z.string().min(1),
  lineIds: z.array(z.string().min(1)).min(1).max(50),
  next: z.enum(['preparing', 'ready']),
});

// When every line on the order is `ready`, the order itself moves to `ready`.
export async function advanceOrderLinesAction(raw: unknown): Promise<ActionResult> {
  const parsed = advanceLineInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const orderObjectId = parseObjectId(parsed.data.orderId);
  if (!orderObjectId) return invalidEntityError('order');

  return runRestaurantAction(
    ['kds.update'],
    { onError: 'Failed to update order line.', onForbidden: KDS_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Order } = getModels(conn);
      const order = await Order.findOne({ restaurantId, _id: orderObjectId }).exec();
      if (!order) throw new Error('Order not found.');

      const lineIdSet = new Set(parsed.data.lineIds);
      let mutated = false;
      for (const line of order.items) {
        if (line._id && lineIdSet.has(String(line._id))) {
          if (line.lineStatus !== parsed.data.next) {
            line.lineStatus = parsed.data.next;
            mutated = true;
          }
        }
      }
      if (!mutated) return { ok: true };

      const lineStatuses = order.items.map(
        (line) => (line.lineStatus ?? 'received') as OrderLineStatus,
      );
      const stage = deriveOrderStage(lineStatuses);
      const now = new Date();
      let newOrderStatus: OrderStatus = order.status;
      if (stage === 'ready' && order.status !== 'ready' && order.status !== 'completed') {
        newOrderStatus = 'ready';
        order.statusHistory.push({ status: 'ready', at: now });
      } else if (
        stage === 'preparing' &&
        (order.status === 'received' || order.status === 'confirmed')
      ) {
        newOrderStatus = 'preparing';
        order.statusHistory.push({ status: 'preparing', at: now });
      }
      order.status = newOrderStatus;
      await order.save();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'station.order_lines.advanced',
        resourceType: 'order',
        resourceId: String(order._id),
        metadata: { lineCount: parsed.data.lineIds.length, next: parsed.data.next },
      });

      try {
        await publishRealtimeEvent(channels.orders(String(restaurantId)), {
          type: 'order.status_changed',
          orderId: String(order._id),
          status: newOrderStatus,
          changedAt: now.toISOString(),
        });
      } catch (err) {
        captureException(err, { surface: 'dashboard:stations', message: 'order publish failed' });
      }
      revalidatePath('/admin/kds');
      revalidatePath('/admin/orders');
      return { ok: true };
    },
  );
}
