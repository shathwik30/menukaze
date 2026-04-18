'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getMongoConnection, getModels, generateQrToken } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
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
