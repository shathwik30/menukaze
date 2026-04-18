'use server';

import { revalidatePath } from 'next/cache';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId, parseObjectIds } from '@menukaze/db/object-id';
import { APIError } from '@menukaze/shared';
import {
  invalidEntityError,
  runRestaurantAction,
  validationError,
  type ActionResult,
} from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const menuInput = z.object({
  name: z.string().min(1).max(120),
  order: z.number().int().min(0).max(999).default(0),
  schedule: z
    .object({
      days: z
        .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
        .min(1)
        .max(7),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional(),
});
const menuUpdate = menuInput.partial().extend({
  id: z.string().min(1),
  schedule: z
    .union([
      z.object({
        days: z
          .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
          .min(1)
          .max(7),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
      z.null(),
    ])
    .optional(),
});

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

const imageInput = z
  .union([
    z.string().url().max(2048),
    z
      .string()
      .startsWith('data:image/', 'Only image uploads are supported.')
      .max(3_000_000, 'Uploaded image is too large.'),
  ])
  .optional();

const itemInput = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priceMinor: z.number().int().min(0),
  imageUrl: imageInput,
  dietaryTags: z.array(z.string().max(30)).max(15).default([]),
  modifiers: z.array(modifierGroup).max(10).default([]),
  comboOf: z.array(z.string().min(1)).max(20).default([]),
});
const itemUpdate = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  priceMinor: z.number().int().min(0).optional(),
  imageUrl: z.union([imageInput, z.null()]).optional(),
  dietaryTags: z.array(z.string().max(30)).max(15).optional(),
  modifiers: z.array(modifierGroup).max(10).optional(),
  comboOf: z.array(z.string().min(1)).max(20).optional(),
});

async function resolveComboItemIds(
  restaurantId: Types.ObjectId,
  comboOf: string[] | undefined,
  currentItemId?: Types.ObjectId,
): Promise<{ ok: true; ids: Types.ObjectId[] } | { ok: false; error: string }> {
  if (!comboOf || comboOf.length === 0) return { ok: true, ids: [] };

  const deduped = [...new Set(comboOf)];
  const comboIds = parseObjectIds(deduped);
  if (!comboIds) {
    return { ok: false, error: 'Unknown combo item.' };
  }
  if (currentItemId && comboIds.some((id) => String(id) === String(currentItemId))) {
    return { ok: false, error: 'An item cannot include itself in a combo.' };
  }

  const conn = await getMongoConnection('live');
  const { Item } = getModels(conn);
  const matches = await Item.find({ restaurantId, _id: { $in: comboIds } }, { _id: 1 })
    .lean()
    .exec();
  if (matches.length !== comboIds.length) {
    return { ok: false, error: 'One or more combo items no longer exist.' };
  }

  return { ok: true, ids: comboIds };
}

export async function createMenuAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = menuInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to create menu.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Menu } = getModels(conn);
      const menu = await Menu.create({ restaurantId, ...parsed.data });
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.created',
        resourceType: 'menu',
        resourceId: String(menu._id),
        metadata: { name: parsed.data.name, order: parsed.data.order },
      });
      revalidatePath('/admin/menu');
      return { ok: true as const, data: { id: String(menu._id) } };
    },
  );
}

export async function updateMenuAction(raw: unknown): Promise<ActionResult> {
  const parsed = menuUpdate.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const menuId = parseObjectId(parsed.data.id);
  if (!menuId) return invalidEntityError('menu');

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to update menu.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Menu } = getModels(conn);
      const { id: _ignoredMenuId, ...patch } = parsed.data;
      const update =
        patch.schedule === null
          ? {
              ...(Object.keys(patch).some((key) => key !== 'schedule')
                ? {
                    $set: Object.fromEntries(
                      Object.entries(patch).filter(([key]) => key !== 'schedule'),
                    ),
                  }
                : {}),
              $unset: { schedule: 1 },
            }
          : { $set: patch };
      const result = await Menu.updateOne({ restaurantId, _id: menuId }, update).exec();
      if (result.matchedCount !== 1) throw new APIError('not_found');
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.updated',
        resourceType: 'menu',
        resourceId: String(menuId),
        metadata: { fields: Object.keys(patch) },
      });
      revalidatePath('/admin/menu');
      return { ok: true as const };
    },
  );
}

export async function deleteMenuAction(id: string): Promise<ActionResult> {
  const menuId = parseObjectId(id);
  if (!menuId) return invalidEntityError('menu');

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to delete menu.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Menu, Category, Item } = getModels(conn);
      const categories = await Category.find({ restaurantId, menuId }).exec();
      const categoryIds = categories.map((c) => c._id);
      if (categoryIds.length > 0) {
        await Item.deleteMany({ restaurantId, categoryId: { $in: categoryIds } }).exec();
      }
      await Category.deleteMany({ restaurantId, menuId }).exec();
      await Menu.deleteOne({ restaurantId, _id: menuId }).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.deleted',
        resourceType: 'menu',
        resourceId: String(menuId),
        metadata: { categoryCount: categoryIds.length },
      });
      revalidatePath('/admin/menu');
      return { ok: true as const };
    },
  );
}

export async function createCategoryAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const menuId = parseObjectId(parsed.data.menuId);
  if (!menuId) return invalidEntityError('menu');

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to create category.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Category, Menu } = getModels(conn);
      const menu = await Menu.findOne({ restaurantId, _id: menuId }).exec();
      if (!menu) return { ok: false as const, error: 'Menu not found.' };
      const category = await Category.create({
        restaurantId,
        menuId,
        name: parsed.data.name,
        order: parsed.data.order,
      });
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.category.created',
        resourceType: 'category',
        resourceId: String(category._id),
        metadata: { menuId: String(menuId), name: parsed.data.name, order: parsed.data.order },
      });
      revalidatePath('/admin/menu');
      return { ok: true as const, data: { id: String(category._id) } };
    },
  );
}

export async function updateCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryUpdate.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const categoryId = parseObjectId(parsed.data.id);
  if (!categoryId) return invalidEntityError('category');

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to update category.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Category } = getModels(conn);
      const { id: _ignoredCategoryId, menuId, ...patch } = parsed.data;
      const set: Record<string, unknown> = { ...patch };
      if (menuId) {
        const nextMenuId = parseObjectId(menuId);
        if (!nextMenuId) return invalidEntityError('menu');
        set['menuId'] = nextMenuId;
      }
      const result = await Category.updateOne(
        { restaurantId, _id: categoryId },
        { $set: set },
      ).exec();
      if (result.matchedCount !== 1) throw new APIError('not_found');
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.category.updated',
        resourceType: 'category',
        resourceId: String(categoryId),
        metadata: { fields: Object.keys(set) },
      });
      revalidatePath('/admin/menu');
      return { ok: true as const };
    },
  );
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const categoryId = parseObjectId(id);
  if (!categoryId) return invalidEntityError('category');

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to delete category.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Category, Item } = getModels(conn);
      await Item.deleteMany({ restaurantId, categoryId }).exec();
      await Category.deleteOne({ restaurantId, _id: categoryId }).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.category.deleted',
        resourceType: 'category',
        resourceId: String(categoryId),
      });
      revalidatePath('/admin/menu');
      return { ok: true as const };
    },
  );
}

export async function createItemAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = itemInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const categoryId = parseObjectId(parsed.data.categoryId);
  if (!categoryId) return invalidEntityError('category');

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to create item.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant, Category, Item } = getModels(conn);
      const restaurant = await Restaurant.findById(restaurantId).exec();
      if (!restaurant) return { ok: false as const, error: 'Restaurant not found.' };
      const category = await Category.findOne({ restaurantId, _id: categoryId }).exec();
      if (!category) return { ok: false as const, error: 'Category not found.' };
      const comboIds = await resolveComboItemIds(restaurantId, parsed.data.comboOf);
      if (!comboIds.ok) return comboIds;
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
        ...(comboIds.ids.length > 0 ? { comboOf: comboIds.ids } : {}),
        soldOut: false,
      });
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.item.created',
        resourceType: 'item',
        resourceId: String(item._id),
        metadata: { name: parsed.data.name, priceMinor: parsed.data.priceMinor },
      });
      revalidatePath('/admin/menu');
      return { ok: true as const, data: { id: String(item._id) } };
    },
  );
}

export async function updateItemAction(raw: unknown): Promise<ActionResult> {
  const parsed = itemUpdate.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const itemId = parseObjectId(parsed.data.id);
  if (!itemId) return invalidEntityError('item');

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to update item.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Item } = getModels(conn);
      const { id: _ignoredItemId, categoryId, ...patch } = parsed.data;
      const set: Record<string, unknown> = { ...patch };
      const unset: Record<string, 1> = {};
      if (categoryId) {
        const nextCategoryId = parseObjectId(categoryId);
        if (!nextCategoryId) return invalidEntityError('category');
        set['categoryId'] = nextCategoryId;
      }
      if ('comboOf' in patch) {
        const comboIds = await resolveComboItemIds(restaurantId, patch.comboOf, itemId);
        if (!comboIds.ok) return comboIds;
        if (comboIds.ids.length > 0) set['comboOf'] = comboIds.ids;
        else unset['comboOf'] = 1;
      }
      if (patch.imageUrl === null) {
        delete set['imageUrl'];
        unset['imageUrl'] = 1;
      }
      const update: Record<string, unknown> = {};
      if (Object.keys(set).length > 0) update['$set'] = set;
      if (Object.keys(unset).length > 0) update['$unset'] = unset;
      const result = await Item.updateOne({ restaurantId, _id: itemId }, update).exec();
      if (result.matchedCount !== 1) throw new APIError('not_found');
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.item.updated',
        resourceType: 'item',
        resourceId: String(itemId),
        metadata: {
          fields: [...Object.keys(set), ...Object.keys(unset).map((k) => `-${k}`)],
        },
      });
      revalidatePath('/admin/menu');
      return { ok: true as const };
    },
  );
}

export async function deleteItemAction(id: string): Promise<ActionResult> {
  const itemId = parseObjectId(id);
  if (!itemId) return invalidEntityError('item');

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to delete item.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Item } = getModels(conn);
      await Item.deleteOne({ restaurantId, _id: itemId }).exec();
      await Item.updateMany(
        { restaurantId, comboOf: itemId },
        { $pull: { comboOf: itemId } },
      ).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.item.deleted',
        resourceType: 'item',
        resourceId: String(itemId),
      });
      revalidatePath('/admin/menu');
      return { ok: true as const };
    },
  );
}

const soldOutInput = z.object({
  id: z.string().min(1),
  soldOut: z.boolean(),
});
export async function toggleItemSoldOutAction(raw: unknown): Promise<ActionResult> {
  const parsed = soldOutInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const itemId = parseObjectId(parsed.data.id);
  if (!itemId) return invalidEntityError('item');

  return runRestaurantAction(
    ['menu.toggle_availability'],
    { onError: 'Failed to toggle item availability.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Item } = getModels(conn);
      await Item.updateOne(
        { restaurantId, _id: itemId },
        { $set: { soldOut: parsed.data.soldOut } },
      ).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: parsed.data.soldOut ? 'menu.item.sold_out' : 'menu.item.back_in_stock',
        resourceType: 'item',
        resourceId: String(itemId),
      });
      revalidatePath('/admin/menu');
      return { ok: true as const };
    },
  );
}
