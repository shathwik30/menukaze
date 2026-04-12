'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getMongoConnection, getModels, generateQrToken } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import {
  actionError,
  invalidEntityError,
  validationError,
  withRestaurantAction,
  type ActionResult,
} from '@/lib/action-helpers';

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

/**
 * Table CRUD for the dashboard (Phase 4 step 16). Regenerating the QR
 * token is a separate action because it should only happen when a sticker
 * is physically replaced — otherwise existing scans would stop resolving.
 */
export async function createTableAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(['tables.edit'], async ({ restaurantId }) => {
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
      revalidatePath('/admin/tables');
      return { ok: true, data: { id: String(table._id) } };
    });
  } catch (error) {
    return actionError(error, 'Failed to create table.', TABLE_PERMISSION_ERROR);
  }
}

export async function updateTableAction(raw: unknown): Promise<ActionResult> {
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const tableId = parseObjectId(parsed.data.id);
  if (!tableId) return invalidEntityError('table');

  try {
    return await withRestaurantAction(['tables.edit'], async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { Table } = getModels(conn);
      const { id: _ignoredId, ...patch } = parsed.data;

      const result = await Table.updateOne({ restaurantId, _id: tableId }, { $set: patch }).exec();
      if (result.matchedCount !== 1) return { ok: false, error: 'Table not found.' };

      revalidatePath('/admin/tables');
      return { ok: true };
    });
  } catch (error) {
    return actionError(error, 'Failed to update table.', TABLE_PERMISSION_ERROR);
  }
}

export async function deleteTableAction(id: string): Promise<ActionResult> {
  const tableId = parseObjectId(id);
  if (!tableId) return invalidEntityError('table');

  try {
    return await withRestaurantAction(['tables.edit'], async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { Table } = getModels(conn);

      await Table.deleteOne({ restaurantId, _id: tableId }).exec();
      revalidatePath('/admin/tables');
      return { ok: true };
    });
  } catch (error) {
    return actionError(error, 'Failed to delete table.', TABLE_PERMISSION_ERROR);
  }
}

export async function regenerateQrTokenAction(id: string): Promise<ActionResult> {
  const tableId = parseObjectId(id);
  if (!tableId) return invalidEntityError('table');

  try {
    return await withRestaurantAction(['tables.edit'], async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { Table } = getModels(conn);
      const result = await Table.updateOne(
        { restaurantId, _id: tableId },
        { $set: { qrToken: generateQrToken() } },
      ).exec();
      if (result.matchedCount !== 1) return { ok: false, error: 'Table not found.' };

      revalidatePath('/admin/tables');
      return { ok: true };
    });
  } catch (error) {
    return actionError(error, 'Failed to regenerate table QR token.', TABLE_PERMISSION_ERROR);
  }
}
