'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getMongoConnection, getModels, generateQrToken } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { captureException } from '@menukaze/monitoring';
import { channels } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import {
  invalidEntityError,
  runRestaurantAction,
  validationError,
  type ActionResult,
} from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const TABLE_PERMISSION_ERROR = 'You do not have permission to manage tables.';

const createInput = z.object({
  number: z.number().int().min(1).max(9999),
  name: z.string().min(1).max(120).optional(),
  capacity: z.number().int().min(1).max(99).default(4),
  zone: z.string().max(60).optional(),
});

const updateInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  capacity: z.number().int().min(1).max(99).optional(),
  zone: z.string().max(60).optional(),
});

// QR regeneration is a separate action — it invalidates the printed sticker.
export async function createTableAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  return runRestaurantAction(
    ['tables.edit'],
    { onError: 'Failed to create table.', onForbidden: TABLE_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Table } = getModels(conn);

      const number = parsed.data.number;
      const existing = await Table.findOne({ restaurantId, number }).exec();
      if (existing) return { ok: false, error: `Table ${number} already exists.` };

      const table = await Table.create({
        restaurantId,
        number,
        name: parsed.data.name ?? `Table ${number}`,
        capacity: parsed.data.capacity,
        ...(parsed.data.zone ? { zone: parsed.data.zone } : {}),
        qrToken: generateQrToken(),
        status: 'available',
      });
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'table.created',
        resourceType: 'table',
        resourceId: String(table._id),
        metadata: { number, capacity: parsed.data.capacity },
      });
      revalidatePath('/admin/tables');
      return { ok: true, data: { id: String(table._id) } };
    },
  );
}

export async function updateTableAction(raw: unknown): Promise<ActionResult> {
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const tableId = parseObjectId(parsed.data.id);
  if (!tableId) return invalidEntityError('table');

  return runRestaurantAction(
    ['tables.edit'],
    { onError: 'Failed to update table.', onForbidden: TABLE_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Table } = getModels(conn);
      const { id: _ignoredId, ...patch } = parsed.data;

      const result = await Table.updateOne({ restaurantId, _id: tableId }, { $set: patch }).exec();
      if (result.matchedCount !== 1) return { ok: false, error: 'Table not found.' };
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'table.updated',
        resourceType: 'table',
        resourceId: String(tableId),
        metadata: { fields: Object.keys(patch) },
      });

      revalidatePath('/admin/tables');
      return { ok: true };
    },
  );
}

export async function deleteTableAction(id: string): Promise<ActionResult> {
  const tableId = parseObjectId(id);
  if (!tableId) return invalidEntityError('table');

  return runRestaurantAction(
    ['tables.edit'],
    { onError: 'Failed to delete table.', onForbidden: TABLE_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Table } = getModels(conn);

      await Table.deleteOne({ restaurantId, _id: tableId }).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'table.deleted',
        resourceType: 'table',
        resourceId: String(tableId),
      });
      revalidatePath('/admin/tables');
      return { ok: true };
    },
  );
}

export async function regenerateQrTokenAction(id: string): Promise<ActionResult> {
  const tableId = parseObjectId(id);
  if (!tableId) return invalidEntityError('table');

  return runRestaurantAction(
    ['tables.edit'],
    { onError: 'Failed to regenerate table QR token.', onForbidden: TABLE_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Table } = getModels(conn);
      const result = await Table.updateOne(
        { restaurantId, _id: tableId },
        { $set: { qrToken: generateQrToken() } },
      ).exec();
      if (result.matchedCount !== 1) return { ok: false, error: 'Table not found.' };
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'table.qr_regenerated',
        resourceType: 'table',
        resourceId: String(tableId),
      });

      revalidatePath('/admin/tables');
      return { ok: true };
    },
  );
}

export async function requestBillAction(sessionId: string): Promise<ActionResult> {
  const sid = parseObjectId(sessionId);
  if (!sid) return invalidEntityError('session');

  return runRestaurantAction(
    ['tables.view'],
    { onError: 'Failed to request bill.', onForbidden: 'You do not have permission to do that.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { TableSession, Table } = getModels(conn);

      const tableSession = await TableSession.findOne({ restaurantId, _id: sid }).exec();
      if (!tableSession) return { ok: false, error: 'Session not found.' };
      if (tableSession.status !== 'active') {
        return { ok: false, error: 'Bill can only be requested for an active session.' };
      }

      const now = new Date();
      await TableSession.updateOne(
        { restaurantId, _id: sid },
        { $set: { status: 'bill_requested', billRequestedAt: now, lastActivityAt: now } },
      ).exec();
      await Table.updateOne(
        { restaurantId, _id: tableSession.tableId },
        { $set: { status: 'bill_requested' } },
      ).exec();

      try {
        await publishRealtimeEvent(channels.tables(String(restaurantId)), {
          type: 'table.status_changed',
          tableId: String(tableSession.tableId),
          status: 'bill_requested',
          changedAt: now.toISOString(),
          reason: 'bill_requested',
        });
      } catch (err) {
        captureException(err, {
          surface: 'dashboard:tables-admin',
          message: 'bill request publish failed',
        });
      }

      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'session.bill_requested',
        resourceType: 'table_session',
        resourceId: String(sid),
      });

      revalidatePath('/admin/tables');
      return { ok: true };
    },
  );
}

export interface TableOrderItem {
  name: string;
  quantity: number;
  lineTotalMinor: number;
  lineStatus?: string;
}

export interface TableActiveOrder {
  id: string;
  status: string;
  totalMinor: number;
  createdAt: string;
  items: TableOrderItem[];
}

export interface TableSessionInfo {
  sessionId: string;
  customerName: string;
  startedAt: string;
  status: string;
  orders: TableActiveOrder[];
  grandTotalMinor: number;
}

export async function getTableActiveOrdersAction(
  tableId: string,
): Promise<ActionResult<TableSessionInfo | null>> {
  const tid = parseObjectId(tableId);
  if (!tid) return invalidEntityError('table');

  return runRestaurantAction(
    ['tables.view'],
    { onError: 'Failed to load table orders.' },
    async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { TableSession, Order } = getModels(conn);

      const tableSession = await TableSession.findOne({
        restaurantId,
        tableId: tid,
        status: { $in: ['active', 'bill_requested', 'needs_review'] },
      })
        .sort({ startedAt: -1 })
        .lean()
        .exec();

      if (!tableSession) return { ok: true, data: null };

      const orders = await Order.find(
        { restaurantId, sessionId: tableSession._id },
        { items: 1, totalMinor: 1, status: 1, createdAt: 1 },
      )
        .sort({ createdAt: 1 })
        .lean()
        .exec();

      const mapped: TableActiveOrder[] = orders.map((o) => ({
        id: String(o._id),
        status: o.status as string,
        totalMinor: o.totalMinor as number,
        createdAt: (o.createdAt as Date).toISOString(),
        items: ((o.items as TableOrderItem[]) ?? []).map((item) => ({
          name: item.name,
          quantity: item.quantity,
          lineTotalMinor: item.lineTotalMinor,
          lineStatus: item.lineStatus,
        })),
      }));

      return {
        ok: true,
        data: {
          sessionId: String(tableSession._id),
          customerName: tableSession.customer.name,
          startedAt: tableSession.startedAt.toISOString(),
          status: tableSession.status as string,
          orders: mapped,
          grandTotalMinor: mapped.reduce((sum, o) => sum + o.totalMinor, 0),
        },
      };
    },
  );
}
