'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import type { Flag } from '@menukaze/rbac';
import { PermissionDeniedError, requireFlags } from '@/lib/session';

/**
 * CRUD server actions for the Menu Management Dashboard (Phase 4 step 15).
 *
 * Every action here:
 *  1. Calls requireOnboarded() to resolve the acting restaurant.
 *  2. Validates input with Zod.
 *  3. Queries with an explicit `{ restaurantId }` filter so the tenant-scoped
 *     plugin never needs the escape hatch.
 *  4. Calls revalidatePath('/admin/menu') on success so the UI re-renders.
 *
 * MVP scope: images are plain URLs; UploadThing integration is tracked as a
 * follow-up. Modifiers can be edited as structured JSON via updateItemAction.
 */

const menuInput = z.object({
  name: z.string().min(1).max(120),
  order: z.number().int().min(0).max(999).default(0),
});
const menuUpdate = menuInput.partial().extend({ id: z.string().min(1) });

const categoryInput = z.object({
  menuId: z.string().min(1),
  name: z.string().min(1).max(120),
  order: z.number().int().min(0).max(999).default(0),
});
const categoryUpdate = categoryInput.partial().extend({ id: z.string().min(1) });

const modifierOption = z.object({
  name: z.string().min(1).max(120),
  priceMinor: z.number().int().min(0),
});
const modifierGroup = z.object({
  name: z.string().min(1).max(120),
  required: z.boolean().default(false),
  max: z.number().int().min(0).default(0),
  options: z.array(modifierOption).max(20),
});

const itemInput = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priceMinor: z.number().int().min(0),
  imageUrl: z.string().url().max(2048).optional(),
  dietaryTags: z.array(z.string().max(30)).max(15).default([]),
  modifiers: z.array(modifierGroup).max(10).default([]),
});
const itemUpdate = itemInput.partial().extend({ id: z.string().min(1) });

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function firstZodError(err: z.ZodError): string {
  const first = err.issues[0];
  return first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input.';
}

/**
 * Resolve the active restaurant AFTER checking the caller holds every flag in
 * `flags`. Throws `PermissionDeniedError` when the caller lacks permission —
 * the action-level try/catch converts that to a `{ ok: false, error }` envelope
 * so the dashboard can render a friendly message.
 */
async function withRestaurant<T>(
  flags: Flag[],
  handler: (restaurantId: Types.ObjectId) => Promise<T>,
): Promise<T> {
  const { session } = await requireFlags(flags);
  return handler(new Types.ObjectId(session.restaurantId));
}

/**
 * Convert a thrown PermissionDeniedError (or any other Error) into the
 * standard `{ ok: false, error }` envelope. Used by every action's top-level
 * catch so the server action can surface the rejection without crashing the
 * request.
 */
function errorEnvelope(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof PermissionDeniedError) {
    return { ok: false, error: 'You do not have permission to do that.' };
  }
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

// ─────────────────────────────  Menus  ─────────────────────────────

export async function createMenuAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = menuInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  try {
    return await withRestaurant(['menu.edit'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Menu } = getModels(conn);
      const menu = await Menu.create({ restaurantId, ...parsed.data });
      revalidatePath('/admin/menu');
      return { ok: true as const, data: { id: String(menu._id) } };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to create menu.');
  }
}

export async function updateMenuAction(raw: unknown): Promise<ActionResult> {
  const parsed = menuUpdate.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  if (!Types.ObjectId.isValid(parsed.data.id)) return { ok: false, error: 'Unknown menu.' };
  try {
    return await withRestaurant(['menu.edit'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Menu } = getModels(conn);
      const { id, ...patch } = parsed.data;
      const result = await Menu.updateOne(
        { restaurantId, _id: new Types.ObjectId(id) },
        { $set: patch },
      ).exec();
      if (result.matchedCount !== 1) throw new APIError('not_found');
      revalidatePath('/admin/menu');
      return { ok: true as const };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to update menu.');
  }
}

export async function deleteMenuAction(id: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: 'Unknown menu.' };
  try {
    return await withRestaurant(['menu.edit'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Menu, Category, Item } = getModels(conn);
      const menuId = new Types.ObjectId(id);
      // Cascade delete — categories under this menu, and their items.
      const categories = await Category.find({ restaurantId, menuId }).exec();
      const categoryIds = categories.map((c) => c._id);
      if (categoryIds.length > 0) {
        await Item.deleteMany({ restaurantId, categoryId: { $in: categoryIds } }).exec();
      }
      await Category.deleteMany({ restaurantId, menuId }).exec();
      await Menu.deleteOne({ restaurantId, _id: menuId }).exec();
      revalidatePath('/admin/menu');
      return { ok: true as const };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to delete menu.');
  }
}

// ──────────────────────────  Categories  ──────────────────────────

export async function createCategoryAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  if (!Types.ObjectId.isValid(parsed.data.menuId)) {
    return { ok: false, error: 'Unknown menu.' };
  }
  try {
    return await withRestaurant(['menu.edit'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Category, Menu } = getModels(conn);
      const menuId = new Types.ObjectId(parsed.data.menuId);
      const menu = await Menu.findOne({ restaurantId, _id: menuId }).exec();
      if (!menu) return { ok: false as const, error: 'Menu not found.' };
      const category = await Category.create({
        restaurantId,
        menuId,
        name: parsed.data.name,
        order: parsed.data.order,
      });
      revalidatePath('/admin/menu');
      return { ok: true as const, data: { id: String(category._id) } };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to create category.');
  }
}

export async function updateCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryUpdate.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  if (!Types.ObjectId.isValid(parsed.data.id)) return { ok: false, error: 'Unknown category.' };
  try {
    return await withRestaurant(['menu.edit'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Category } = getModels(conn);
      const { id, menuId, ...patch } = parsed.data;
      const set: Record<string, unknown> = { ...patch };
      if (menuId) {
        if (!Types.ObjectId.isValid(menuId)) {
          return { ok: false as const, error: 'Unknown menu.' };
        }
        set['menuId'] = new Types.ObjectId(menuId);
      }
      const result = await Category.updateOne(
        { restaurantId, _id: new Types.ObjectId(id) },
        { $set: set },
      ).exec();
      if (result.matchedCount !== 1) throw new APIError('not_found');
      revalidatePath('/admin/menu');
      return { ok: true as const };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to update category.');
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: 'Unknown category.' };
  try {
    return await withRestaurant(['menu.edit'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Category, Item } = getModels(conn);
      const categoryId = new Types.ObjectId(id);
      await Item.deleteMany({ restaurantId, categoryId }).exec();
      await Category.deleteOne({ restaurantId, _id: categoryId }).exec();
      revalidatePath('/admin/menu');
      return { ok: true as const };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to delete category.');
  }
}

// ────────────────────────────  Items  ────────────────────────────

export async function createItemAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = itemInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  if (!Types.ObjectId.isValid(parsed.data.categoryId)) {
    return { ok: false, error: 'Unknown category.' };
  }
  try {
    return await withRestaurant(['menu.edit'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Restaurant, Category, Item } = getModels(conn);
      const restaurant = await Restaurant.findById(restaurantId).exec();
      if (!restaurant) return { ok: false as const, error: 'Restaurant not found.' };
      const category = await Category.findOne({
        restaurantId,
        _id: new Types.ObjectId(parsed.data.categoryId),
      }).exec();
      if (!category) return { ok: false as const, error: 'Category not found.' };
      const item = await Item.create({
        restaurantId,
        categoryId: category._id,
        name: parsed.data.name,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        priceMinor: parsed.data.priceMinor,
        currency: restaurant.currency,
        ...(parsed.data.imageUrl ? { imageUrl: parsed.data.imageUrl } : {}),
        dietaryTags: parsed.data.dietaryTags,
        modifiers: parsed.data.modifiers,
        soldOut: false,
      });
      revalidatePath('/admin/menu');
      return { ok: true as const, data: { id: String(item._id) } };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to create item.');
  }
}

export async function updateItemAction(raw: unknown): Promise<ActionResult> {
  const parsed = itemUpdate.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  if (!Types.ObjectId.isValid(parsed.data.id)) return { ok: false, error: 'Unknown item.' };
  try {
    return await withRestaurant(['menu.edit'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Item } = getModels(conn);
      const { id, categoryId, ...patch } = parsed.data;
      const set: Record<string, unknown> = { ...patch };
      if (categoryId) {
        if (!Types.ObjectId.isValid(categoryId)) {
          return { ok: false as const, error: 'Unknown category.' };
        }
        set['categoryId'] = new Types.ObjectId(categoryId);
      }
      const result = await Item.updateOne(
        { restaurantId, _id: new Types.ObjectId(id) },
        { $set: set },
      ).exec();
      if (result.matchedCount !== 1) throw new APIError('not_found');
      revalidatePath('/admin/menu');
      return { ok: true as const };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to update item.');
  }
}

export async function deleteItemAction(id: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: 'Unknown item.' };
  try {
    return await withRestaurant(['menu.edit'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Item } = getModels(conn);
      await Item.deleteOne({ restaurantId, _id: new Types.ObjectId(id) }).exec();
      revalidatePath('/admin/menu');
      return { ok: true as const };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to delete item.');
  }
}

const soldOutInput = z.object({
  id: z.string().min(1),
  soldOut: z.boolean(),
});
export async function toggleItemSoldOutAction(raw: unknown): Promise<ActionResult> {
  const parsed = soldOutInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  if (!Types.ObjectId.isValid(parsed.data.id)) return { ok: false, error: 'Unknown item.' };
  try {
    // Sold-out toggle is the one action kitchen staff can perform via the
    // flag matrix. We allow either full menu.edit OR the narrower
    // menu.toggle_availability flag.
    return await withRestaurant(['menu.toggle_availability'], async (restaurantId) => {
      const conn = await getMongoConnection('live');
      const { Item } = getModels(conn);
      await Item.updateOne(
        { restaurantId, _id: new Types.ObjectId(parsed.data.id) },
        { $set: { soldOut: parsed.data.soldOut } },
      ).exec();
      revalidatePath('/admin/menu');
      return { ok: true as const };
    });
  } catch (error) {
    return errorEnvelope(error, 'Failed to toggle.');
  }
}
