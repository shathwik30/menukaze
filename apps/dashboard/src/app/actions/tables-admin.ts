'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels, generateQrToken } from '@menukaze/db';
import { requireOnboarded } from '@/lib/session';

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

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function firstZodError(err: z.ZodError): string {
  const first = err.issues[0];
  return first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input.';
}

/**
 * Table CRUD for the dashboard (Phase 4 step 16). Regenerating the QR
 * token is a separate action because it should only happen when a sticker
 * is physically replaced — otherwise existing scans would stop resolving.
 */
export async function createTableAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);
  const conn = await getMongoConnection('live');
  const { Table } = getModels(conn);

  const number = parsed.data.number;
  const existing = await Table.findOne({ restaurantId, number }).exec();
  if (existing) return { ok: false, error: `Table ${number} already exists.` };

  try {
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
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to create table.' };
  }
}

export async function updateTableAction(raw: unknown): Promise<ActionResult> {
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  if (!Types.ObjectId.isValid(parsed.data.id)) return { ok: false, error: 'Unknown table.' };
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);
  const conn = await getMongoConnection('live');
  const { Table } = getModels(conn);

  const { id, ...patch } = parsed.data;
  const result = await Table.updateOne(
    { restaurantId, _id: new Types.ObjectId(id) },
    { $set: patch },
  ).exec();
  if (result.matchedCount !== 1) return { ok: false, error: 'Table not found.' };
  revalidatePath('/admin/tables');
  return { ok: true };
}

export async function deleteTableAction(id: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: 'Unknown table.' };
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);
  const conn = await getMongoConnection('live');
  const { Table } = getModels(conn);
  await Table.deleteOne({ restaurantId, _id: new Types.ObjectId(id) }).exec();
  revalidatePath('/admin/tables');
  return { ok: true };
}

export async function regenerateQrTokenAction(id: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: 'Unknown table.' };
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);
  const conn = await getMongoConnection('live');
  const { Table } = getModels(conn);
  const result = await Table.updateOne(
    { restaurantId, _id: new Types.ObjectId(id) },
    { $set: { qrToken: generateQrToken() } },
  ).exec();
  if (result.matchedCount !== 1) return { ok: false, error: 'Table not found.' };
  revalidatePath('/admin/tables');
  return { ok: true };
}
