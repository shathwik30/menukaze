'use server';

import { revalidatePath } from 'next/cache';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { ALLERGENS, APIError } from '@menukaze/shared';
import {
  invalidEntityError,
  runRestaurantAction,
  validationError,
  type ActionResult,
} from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const scheduleInput = z.object({
  days: z
    .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
    .min(1)
    .max(7),
  startTime: hhmmSchema,
  endTime: hhmmSchema,
});
const nullableScheduleInput = z.union([scheduleInput, z.null()]);

const menuInput = z.object({
  name: z.string().min(1).max(120),
  order: z.number().int().min(0).max(999).default(0),
  status: z.enum(['draft', 'published']).default('published'),
  schedule: scheduleInput.optional(),
});
const menuUpdate = menuInput.partial().extend({
  id: z.string().min(1),
  schedule: nullableScheduleInput.optional(),
});

const categoryInput = z.object({
  menuId: z.string().min(1),
  menuIds: z.array(z.string().min(1)).min(1).max(20).optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(300).optional(),
  order: z.number().int().min(0).max(999).default(0),
});
const categoryUpdate = categoryInput.partial().extend({
  id: z.string().min(1),
  description: z.union([z.string().max(300), z.null()]).optional(),
});

const modifierOption = z.object({
  name: z.string().min(1).max(120),
  priceMinor: z.number().int().min(0),
});
const modifierGroup = z.object({
  name: z.string().min(1).max(120),
  min: z.number().int().min(0).optional(),
  required: z.boolean().default(false),
  max: z.number().int().min(0).default(0),
  options: z.array(modifierOption).max(20),
});
const variantInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  priceMinor: z.number().int().min(0),
  order: z.number().int().min(0).default(0),
  isDefault: z.boolean().default(false),
  soldOut: z.boolean().default(false),
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
  categoryId: z.string().min(1).optional(),
  categoryIds: z.array(z.string().min(1)).min(1).max(20).optional(),
  name: z.string().min(1).max(200),
  status: z.enum(['draft', 'published']).default('published'),
  description: z.string().max(1000).optional(),
  priceMinor: z.number().int().min(0),
  isHidden: z.boolean().default(false),
  availableFor: z
    .array(z.enum(['storefront', 'qr_dinein', 'kiosk', 'walk_in', 'api']))
    .min(1)
    .max(5)
    .default(['storefront', 'qr_dinein', 'kiosk', 'walk_in', 'api']),
  schedule: scheduleInput.optional(),
  imageUrl: imageInput,
  dietaryTags: z.array(z.string().max(30)).max(15).default([]),
  allergens: z.array(z.enum(ALLERGENS)).max(14).default([]),
  variants: z.array(variantInput).max(20).default([]),
  modifiers: z.array(modifierGroup).max(10).default([]),
  taxClassId: z.string().max(64).optional(),
  featured: z.boolean().default(false),
  searchKeywords: z.array(z.string().max(40)).max(20).default([]),
});
const itemUpdate = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  categoryIds: z.array(z.string().min(1)).min(1).max(20).optional(),
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['draft', 'published']).optional(),
  description: z.string().max(1000).optional(),
  priceMinor: z.number().int().min(0).optional(),
  isHidden: z.boolean().optional(),
  availableFor: z
    .array(z.enum(['storefront', 'qr_dinein', 'kiosk', 'walk_in', 'api']))
    .min(1)
    .max(5)
    .optional(),
  schedule: nullableScheduleInput.optional(),
  imageUrl: z.union([imageInput, z.null()]).optional(),
  dietaryTags: z.array(z.string().max(30)).max(15).optional(),
  allergens: z.array(z.enum(ALLERGENS)).max(14).optional(),
  variants: z.array(variantInput).max(20).optional(),
  modifiers: z.array(modifierGroup).max(10).optional(),
  taxClassId: z.union([z.string().max(64), z.null()]).optional(),
  featured: z.boolean().optional(),
  searchKeywords: z.array(z.string().max(40)).max(20).optional(),
});
const reorderCategoryItemsInput = z.object({
  categoryId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1).max(500),
});

function normalizeModifiers(groups: Array<z.infer<typeof modifierGroup>>): Array<{
  name: string;
  min: number;
  max: number;
  options: Array<{ name: string; priceMinor: number }>;
}> {
  return groups.map((group) => ({
    name: group.name,
    min: Math.max(0, group.min ?? (group.required ? 1 : 0)),
    max: group.max,
    options: group.options,
  }));
}

function normalizeVariants(groups: Array<z.infer<typeof variantInput>>) {
  const sanitized = groups
    .map((variant, index) => ({
      ...(variant.id ? { _id: parseObjectId(variant.id) ?? undefined } : {}),
      name: variant.name.trim(),
      priceMinor: variant.priceMinor,
      order: variant.order ?? index,
      isDefault: variant.isDefault,
      soldOut: variant.soldOut ?? false,
    }))
    .filter((variant) => variant.name.length > 0);
  if (sanitized.length === 0) return [];

  let defaultFound = false;
  return sanitized
    .map((variant, index) => {
      const next = {
        ...variant,
        order: Number.isFinite(variant.order) ? variant.order : index,
        isDefault: variant.isDefault && !defaultFound,
      };
      if (next.isDefault) defaultFound = true;
      return next;
    })
    .map((variant, index) =>
      defaultFound || index !== 0 ? variant : { ...variant, isDefault: true },
    );
}

function dedupePreserveOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

async function resolveCategoryIds(
  restaurantId: Parameters<Parameters<typeof runRestaurantAction>[2]>[0]['restaurantId'],
  categoryId: string | undefined,
  categoryIds: string[] | undefined,
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const requestedIds = dedupePreserveOrder(
    categoryIds && categoryIds.length > 0 ? categoryIds : categoryId ? [categoryId] : [],
  );
  if (requestedIds.length === 0) {
    return { ok: false, error: 'Select at least one category.' };
  }

  const parsedIds = requestedIds.map((value) => parseObjectId(value));
  if (parsedIds.some((value) => !value)) {
    return { ok: false, error: 'Category not found.' };
  }

  const conn = await getMongoConnection('live');
  const { Category } = getModels(conn);
  const categories = await Category.find({ restaurantId, _id: { $in: parsedIds } }, { _id: 1 })
    .lean()
    .exec();
  if (categories.length !== requestedIds.length) {
    return { ok: false, error: 'Category not found.' };
  }

  return { ok: true, ids: requestedIds };
}

async function resolveMenuIds(
  restaurantId: Parameters<Parameters<typeof runRestaurantAction>[2]>[0]['restaurantId'],
  menuId: string | undefined,
  menuIds: string[] | undefined,
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const requestedIds = dedupePreserveOrder(
    menuIds && menuIds.length > 0 ? menuIds : menuId ? [menuId] : [],
  );
  if (requestedIds.length === 0) {
    return { ok: false, error: 'Select at least one menu.' };
  }

  const parsedIds = requestedIds.map((value) => parseObjectId(value));
  if (parsedIds.some((value) => !value)) {
    return { ok: false, error: 'Menu not found.' };
  }

  const conn = await getMongoConnection('live');
  const { Menu } = getModels(conn);
  const menus = await Menu.find({ restaurantId, _id: { $in: parsedIds } }, { _id: 1 })
    .lean()
    .exec();
  if (menus.length !== requestedIds.length) {
    return { ok: false, error: 'Menu not found.' };
  }

  return { ok: true, ids: requestedIds };
}

async function syncItemMemberships(
  restaurantId: Parameters<Parameters<typeof runRestaurantAction>[2]>[0]['restaurantId'],
  itemId: string,
  categoryIds: readonly string[],
): Promise<void> {
  const conn = await getMongoConnection('live');
  const { CategoryItemMembership } = getModels(conn);
  const parsedItemId = parseObjectId(itemId);
  if (!parsedItemId) throw new APIError('not_found');

  await CategoryItemMembership.deleteMany({ restaurantId, itemId: parsedItemId }).exec();
  await CategoryItemMembership.create(
    categoryIds.flatMap((categoryId, order) => {
      const parsedCategoryId = parseObjectId(categoryId);
      if (!parsedCategoryId) return [];
      return [
        {
          restaurantId,
          categoryId: parsedCategoryId,
          itemId: parsedItemId,
          order,
        },
      ];
    }),
  );
}

async function deleteOrphanedItems(
  restaurantId: Parameters<Parameters<typeof runRestaurantAction>[2]>[0]['restaurantId'],
  candidateItemIds: readonly string[],
): Promise<number> {
  if (candidateItemIds.length === 0) return 0;

  const conn = await getMongoConnection('live');
  const { CategoryItemMembership, Item } = getModels(conn);
  const parsedIds = candidateItemIds
    .map((itemId) => parseObjectId(itemId))
    .filter((itemId): itemId is NonNullable<typeof itemId> => Boolean(itemId));
  if (parsedIds.length === 0) return 0;

  const remainingMemberships = await CategoryItemMembership.find(
    { restaurantId, itemId: { $in: parsedIds } },
    { itemId: 1 },
  )
    .lean()
    .exec();
  const remainingItemIds = new Set(
    remainingMemberships.map((membership) => String(membership.itemId)),
  );
  const orphanedIds = parsedIds.filter((itemId) => !remainingItemIds.has(String(itemId)));
  if (orphanedIds.length === 0) return 0;

  const result = await Item.deleteMany({ restaurantId, _id: { $in: orphanedIds } }).exec();
  return result.deletedCount ?? orphanedIds.length;
}

async function syncPrimaryCategoryIds(
  restaurantId: Parameters<Parameters<typeof runRestaurantAction>[2]>[0]['restaurantId'],
  candidateItemIds: readonly string[],
): Promise<void> {
  if (candidateItemIds.length === 0) return;

  const conn = await getMongoConnection('live');
  const { CategoryItemMembership, Item } = getModels(conn);
  const parsedIds = candidateItemIds
    .map((itemId) => parseObjectId(itemId))
    .filter((itemId): itemId is NonNullable<typeof itemId> => Boolean(itemId));
  if (parsedIds.length === 0) return;

  const memberships = await CategoryItemMembership.find({
    restaurantId,
    itemId: { $in: parsedIds },
  })
    .sort({ order: 1, createdAt: 1 })
    .lean()
    .exec();
  const primaryCategoryByItemId = new Map<string, string>();
  for (const membership of memberships) {
    const itemId = String(membership.itemId);
    if (!primaryCategoryByItemId.has(itemId)) {
      primaryCategoryByItemId.set(itemId, String(membership.categoryId));
    }
  }

  await Promise.all(
    Array.from(primaryCategoryByItemId.entries()).map(async ([itemId, categoryId]) => {
      const parsedItemId = parseObjectId(itemId);
      const parsedCategoryId = parseObjectId(categoryId);
      if (!parsedItemId || !parsedCategoryId) return;
      await Item.updateOne(
        { restaurantId, _id: parsedItemId },
        { $set: { categoryId: parsedCategoryId } },
      ).exec();
    }),
  );
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
        metadata: { name: parsed.data.name, order: parsed.data.order, status: parsed.data.status },
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
      const { Menu, Category, CategoryItemMembership } = getModels(conn);
      const categories = await Category.find({
        restaurantId,
        $or: [{ menuId }, { menuIds: menuId }],
      }).exec();
      const deletedCategoryIds: Types.ObjectId[] = [];
      const impactedItemIds: string[] = [];

      for (const category of categories) {
        const menuIds = dedupePreserveOrder(
          (Array.isArray(category.menuIds) && category.menuIds.length > 0
            ? category.menuIds
            : [category.menuId]
          ).map((value) => String(value)),
        );
        const remainingMenuIds = menuIds.filter((value) => value !== String(menuId));
        if (remainingMenuIds.length > 0) {
          const primaryMenuId = parseObjectId(remainingMenuIds[0]!);
          if (!primaryMenuId) continue;
          const parsedRemainingMenuIds = remainingMenuIds.flatMap((value) => {
            const parsedMenuId = parseObjectId(value);
            return parsedMenuId ? [parsedMenuId] : [];
          });
          await Category.updateOne(
            { restaurantId, _id: category._id },
            { $set: { menuId: primaryMenuId, menuIds: parsedRemainingMenuIds } },
          ).exec();
          continue;
        }
        deletedCategoryIds.push(category._id);
      }

      if (deletedCategoryIds.length > 0) {
        const impactedMemberships = await CategoryItemMembership.find(
          { restaurantId, categoryId: { $in: deletedCategoryIds } },
          { itemId: 1 },
        )
          .lean()
          .exec();
        impactedItemIds.push(...impactedMemberships.map((membership) => String(membership.itemId)));
        await CategoryItemMembership.deleteMany({
          restaurantId,
          categoryId: { $in: deletedCategoryIds },
        }).exec();
        const deletedItemCount = await deleteOrphanedItems(restaurantId, impactedItemIds);
        await syncPrimaryCategoryIds(restaurantId, impactedItemIds);
        void deletedItemCount;
      }
      if (deletedCategoryIds.length > 0) {
        await Category.deleteMany({ restaurantId, _id: { $in: deletedCategoryIds } }).exec();
      }
      await Menu.deleteOne({ restaurantId, _id: menuId }).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.deleted',
        resourceType: 'menu',
        resourceId: String(menuId),
        metadata: {
          categoryCount: categories.length,
          deletedCategoryCount: deletedCategoryIds.length,
        },
      });
      revalidatePath('/admin/menu');
      return { ok: true as const };
    },
  );
}

export async function createCategoryAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to create category.' },
    async ({ restaurantId, session, role }) => {
      const resolvedMenuIds = await resolveMenuIds(
        restaurantId,
        parsed.data.menuId,
        parsed.data.menuIds,
      );
      if (!resolvedMenuIds.ok) {
        return { ok: false as const, error: resolvedMenuIds.error };
      }
      const primaryMenuId = parseObjectId(resolvedMenuIds.ids[0]!);
      if (!primaryMenuId) return invalidEntityError('menu');
      const conn = await getMongoConnection('live');
      const { Category } = getModels(conn);
      const category = await Category.create({
        restaurantId,
        menuId: primaryMenuId,
        menuIds: resolvedMenuIds.ids.flatMap((value) => {
          const parsedMenuId = parseObjectId(value);
          return parsedMenuId ? [parsedMenuId] : [];
        }),
        name: parsed.data.name,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
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
        metadata: {
          menuIds: resolvedMenuIds.ids,
          name: parsed.data.name,
          order: parsed.data.order,
        },
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
      const resolvedMenuIds =
        parsed.data.menuId || parsed.data.menuIds
          ? await resolveMenuIds(restaurantId, parsed.data.menuId, parsed.data.menuIds)
          : null;
      if (resolvedMenuIds && !resolvedMenuIds.ok) {
        return { ok: false as const, error: resolvedMenuIds.error };
      }
      const conn = await getMongoConnection('live');
      const { Category } = getModels(conn);
      const {
        id: _ignoredCategoryId,
        menuId: _ignoredMenuId,
        menuIds: _ignoredMenuIds,
        description,
        ...patch
      } = parsed.data;
      const set: Record<string, unknown> = { ...patch };
      const unset: Record<string, 1> = {};
      if (resolvedMenuIds?.ok) {
        const primaryMenuId = parseObjectId(resolvedMenuIds.ids[0]!);
        if (!primaryMenuId) return invalidEntityError('menu');
        set['menuId'] = primaryMenuId;
        set['menuIds'] = resolvedMenuIds.ids.flatMap((value) => {
          const parsedMenuId = parseObjectId(value);
          return parsedMenuId ? [parsedMenuId] : [];
        });
      }
      if (description === null) {
        unset['description'] = 1;
      } else if (typeof description === 'string') {
        set['description'] = description;
      }
      const update: Record<string, unknown> = {};
      if (Object.keys(set).length > 0) update['$set'] = set;
      if (Object.keys(unset).length > 0) update['$unset'] = unset;
      const result = await Category.updateOne({ restaurantId, _id: categoryId }, update).exec();
      if (result.matchedCount !== 1) throw new APIError('not_found');
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.category.updated',
        resourceType: 'category',
        resourceId: String(categoryId),
        metadata: { fields: [...Object.keys(set), ...Object.keys(unset).map((key) => `-${key}`)] },
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
      const { Category, CategoryItemMembership } = getModels(conn);
      const impactedMemberships = await CategoryItemMembership.find(
        { restaurantId, categoryId },
        { itemId: 1 },
      )
        .lean()
        .exec();
      await CategoryItemMembership.deleteMany({ restaurantId, categoryId }).exec();
      await deleteOrphanedItems(
        restaurantId,
        impactedMemberships.map((membership) => String(membership.itemId)),
      );
      await syncPrimaryCategoryIds(
        restaurantId,
        impactedMemberships.map((membership) => String(membership.itemId)),
      );
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

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to create item.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant, Item } = getModels(conn);
      const restaurant = await Restaurant.findById(restaurantId).exec();
      if (!restaurant) return { ok: false as const, error: 'Restaurant not found.' };
      const resolvedCategories = await resolveCategoryIds(
        restaurantId,
        parsed.data.categoryId,
        parsed.data.categoryIds,
      );
      if (!resolvedCategories.ok) return resolvedCategories;
      const primaryCategoryKey = resolvedCategories.ids[0];
      if (!primaryCategoryKey) return invalidEntityError('category');
      const primaryCategoryId = parseObjectId(primaryCategoryKey);
      if (!primaryCategoryId) return invalidEntityError('category');
      const item = await Item.create({
        restaurantId,
        categoryId: primaryCategoryId,
        name: parsed.data.name,
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        priceMinor: parsed.data.priceMinor,
        currency: restaurant.currency,
        status: parsed.data.status,
        isHidden: parsed.data.isHidden,
        availableFor: parsed.data.availableFor,
        ...(parsed.data.schedule ? { schedule: parsed.data.schedule } : {}),
        ...(parsed.data.imageUrl ? { imageUrl: parsed.data.imageUrl } : {}),
        dietaryTags: parsed.data.dietaryTags,
        allergens: parsed.data.allergens,
        variants: normalizeVariants(parsed.data.variants),
        modifiers: normalizeModifiers(parsed.data.modifiers),
        ...(parsed.data.taxClassId ? { taxClassId: parsed.data.taxClassId } : {}),
        featured: parsed.data.featured,
        searchKeywords: parsed.data.searchKeywords,
        soldOut: false,
      });
      await syncItemMemberships(restaurantId, String(item._id), resolvedCategories.ids);
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
      const {
        id: _ignoredItemId,
        categoryId,
        categoryIds,
        modifiers,
        variants,
        schedule,
        taxClassId,
        ...patch
      } = parsed.data;
      const set: Record<string, unknown> = { ...patch };
      const unset: Record<string, 1> = {};
      let resolvedCategoryIds: string[] | null = null;
      if (categoryId || categoryIds) {
        const resolvedCategories = await resolveCategoryIds(restaurantId, categoryId, categoryIds);
        if (!resolvedCategories.ok) return resolvedCategories;
        const primaryCategoryKey = resolvedCategories.ids[0];
        if (!primaryCategoryKey) return invalidEntityError('category');
        const primaryCategoryId = parseObjectId(primaryCategoryKey);
        if (!primaryCategoryId) return invalidEntityError('category');
        set['categoryId'] = primaryCategoryId;
        resolvedCategoryIds = resolvedCategories.ids;
      }
      if (modifiers) {
        set['modifiers'] = normalizeModifiers(modifiers);
      }
      if (variants) {
        set['variants'] = normalizeVariants(variants);
      }
      if (schedule === null) {
        unset['schedule'] = 1;
      } else if (schedule) {
        set['schedule'] = schedule;
      }
      if (taxClassId === null) {
        unset['taxClassId'] = 1;
      } else if (typeof taxClassId === 'string') {
        set['taxClassId'] = taxClassId;
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
      if (resolvedCategoryIds) {
        await syncItemMemberships(restaurantId, parsed.data.id, resolvedCategoryIds);
      }
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
      const { Item, CategoryItemMembership } = getModels(conn);
      await CategoryItemMembership.deleteMany({ restaurantId, itemId }).exec();
      await Item.deleteOne({ restaurantId, _id: itemId }).exec();
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

export async function reorderCategoryItemsAction(raw: unknown): Promise<ActionResult> {
  const parsed = reorderCategoryItemsInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const categoryId = parseObjectId(parsed.data.categoryId);
  if (!categoryId) return invalidEntityError('category');

  return runRestaurantAction(
    ['menu.edit'],
    { onError: 'Failed to reorder items.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { CategoryItemMembership } = getModels(conn);
      const parsedItemIds = parsed.data.itemIds
        .map((itemId) => parseObjectId(itemId))
        .filter((itemId): itemId is NonNullable<typeof itemId> => Boolean(itemId));
      if (parsedItemIds.length !== parsed.data.itemIds.length) return invalidEntityError('item');

      const memberships = await CategoryItemMembership.find(
        { restaurantId, categoryId, itemId: { $in: parsedItemIds } },
        { itemId: 1 },
      )
        .lean()
        .exec();
      if (memberships.length !== parsedItemIds.length) {
        return {
          ok: false as const,
          error: 'One or more items are not assigned to this category.',
        };
      }

      await Promise.all(
        parsedItemIds.map((itemId, order) =>
          CategoryItemMembership.updateOne(
            { restaurantId, categoryId, itemId },
            { $set: { order } },
          ).exec(),
        ),
      );

      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'menu.category.items.reordered',
        resourceType: 'category',
        resourceId: String(categoryId),
        metadata: { itemCount: parsedItemIds.length },
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
