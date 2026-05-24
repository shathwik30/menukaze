import type { Connection, Types } from 'mongoose';
import {
  filterActiveMenus,
  isMenuScheduleActive,
  resolvePrimaryStationId,
  type Allergen,
  type OrderChannel,
} from '@menukaze/shared';
import { getModels } from './models';
import type { CategoryItemMembershipDoc } from './models/category-item-membership';
import type { ItemDoc } from './models/item';
import type { MenuDoc } from './models/menu';

type MenuRecord = MenuDoc & { _id: Types.ObjectId };
type ItemRecord = ItemDoc & { _id: Types.ObjectId };
type MembershipRecord = CategoryItemMembershipDoc & { _id: Types.ObjectId };

export interface MenuProjectionItem {
  id: string;
  categoryId: string;
  primaryCategoryId: string;
  name: string;
  description?: string;
  priceMinor: number;
  currency: string;
  variants: Array<{
    id: string;
    name: string;
    priceMinor: number;
    order: number;
    isDefault: boolean;
    soldOut: boolean;
  }>;
  imageUrl?: string;
  dietaryTags: string[];
  allergens: Allergen[];
  modifiers: Array<{
    name: string;
    min: number;
    max: number;
    required: boolean;
    options: Array<{
      name: string;
      priceMinor: number;
    }>;
  }>;
  soldOut: boolean;
  status: 'draft' | 'published';
  isHidden: boolean;
  availableFor?: OrderChannel[];
  schedule?: {
    days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
    startTime: string;
    endTime: string;
  };
  taxClassId?: string;
  featured: boolean;
  searchKeywords: string[];
  stationIds?: Types.ObjectId[];
  estimatedPrepMinutes?: number;
}

export interface MenuProjectionCategory {
  id: string;
  menuId: string;
  menuIds: string[];
  name: string;
  description?: string;
  order: number;
  stationIds?: Types.ObjectId[];
  items: MenuProjectionItem[];
}

export interface MenuProjectionMenu {
  id: string;
  name: string;
  order: number;
  status: 'draft' | 'published';
  schedule?: {
    days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
    startTime: string;
    endTime: string;
  };
  categories: MenuProjectionCategory[];
}

export interface MenuProjection {
  menus: MenuProjectionMenu[];
  categories: MenuProjectionCategory[];
  items: MenuProjectionItem[];
}

interface LoadMenuProjectionOptions {
  restaurantId: Types.ObjectId;
  timeZone: string;
  now?: Date;
  channel?: OrderChannel;
  includeDraftMenus?: boolean;
  includeDraftItems?: boolean;
  includeInactiveMenus?: boolean;
}

function normalizeMenuStatus(menu: Pick<MenuRecord, 'status'>): 'draft' | 'published' {
  return menu.status === 'draft' ? 'draft' : 'published';
}

function normalizeItemStatus(item: Pick<ItemRecord, 'status'>): 'draft' | 'published' {
  return item.status === 'draft' ? 'draft' : 'published';
}

function normalizeModifierGroup(
  group: ItemRecord['modifiers'][number],
): MenuProjectionItem['modifiers'][number] {
  const rawMin =
    typeof group.min === 'number' ? group.min : 'required' in group && group.required ? 1 : 0;
  const min = Math.max(0, rawMin);

  return {
    name: group.name,
    min,
    max: group.max,
    required: min > 0,
    options: group.options.map((option) => ({
      name: option.name,
      priceMinor: option.priceMinor,
    })),
  };
}

function buildLegacyMemberships(items: ItemRecord[]): MembershipRecord[] {
  const byCategoryId = new Map<string, ItemRecord[]>();

  for (const item of items) {
    const key = String(item.categoryId);
    const list = byCategoryId.get(key) ?? [];
    list.push(item);
    byCategoryId.set(key, list);
  }

  const memberships: MembershipRecord[] = [];
  for (const [, categoryItems] of byCategoryId) {
    categoryItems
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .forEach((item, order) => {
        memberships.push({
          _id: item._id,
          restaurantId: item.restaurantId,
          categoryId: item.categoryId,
          itemId: item._id,
          order,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        } as MembershipRecord);
      });
  }

  return memberships;
}

function getCategoryMenuIds(category: {
  menuId: string | Types.ObjectId;
  menuIds?: Array<string | Types.ObjectId>;
}): string[] {
  const rawMenuIds =
    Array.isArray(category.menuIds) && category.menuIds.length > 0
      ? category.menuIds
      : [category.menuId];
  return [...new Set(rawMenuIds.map((value) => String(value)))];
}

export async function loadMenuProjection(
  connection: Connection,
  options: LoadMenuProjectionOptions,
): Promise<MenuProjection> {
  const {
    restaurantId,
    timeZone,
    now,
    channel,
    includeDraftItems = false,
    includeDraftMenus = false,
  } = options;
  const { Menu, Category, Item, CategoryItemMembership } = getModels(connection);

  const [menus, categories, items, memberships] = await Promise.all([
    Menu.find({ restaurantId }).sort({ order: 1, createdAt: 1 }).lean().exec(),
    Category.find({ restaurantId }).sort({ order: 1, createdAt: 1 }).lean().exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).lean().exec(),
    CategoryItemMembership.find({ restaurantId }).sort({ order: 1, createdAt: 1 }).lean().exec(),
  ]);

  const effectiveMenus = includeDraftMenus
    ? menus
    : menus.filter((menu) => normalizeMenuStatus(menu) === 'published');
  const visibleMenus = options.includeInactiveMenus
    ? effectiveMenus
    : filterActiveMenus(effectiveMenus, timeZone, now);
  const visibleMenuIds = new Set(visibleMenus.map((menu) => String(menu._id)));
  const visibleCategories = categories.filter((category) =>
    getCategoryMenuIds(category).some((menuId) => visibleMenuIds.has(menuId)),
  );
  const visibleCategoryIds = new Set(visibleCategories.map((category) => String(category._id)));
  const effectiveItems = includeDraftItems
    ? items
    : items.filter(
        (item) =>
          normalizeItemStatus(item) === 'published' &&
          !item.isHidden &&
          isMenuScheduleActive(item.schedule, timeZone, now) &&
          (!channel || !item.availableFor || item.availableFor.includes(channel)),
      );
  const itemById = new Map(effectiveItems.map((item) => [String(item._id), item]));

  const normalizedMemberships =
    memberships.length > 0
      ? memberships.filter((membership) => visibleCategoryIds.has(String(membership.categoryId)))
      : buildLegacyMemberships(effectiveItems).filter((membership) =>
          visibleCategoryIds.has(String(membership.categoryId)),
        );

  const primaryCategoryIdByItemId = new Map<string, string>();
  const membershipsByCategoryId = new Map<string, MembershipRecord[]>();

  for (const membership of normalizedMemberships) {
    const itemId = String(membership.itemId);
    if (!itemById.has(itemId)) continue;
    primaryCategoryIdByItemId.set(
      itemId,
      primaryCategoryIdByItemId.get(itemId) ?? String(membership.categoryId),
    );
    const list = membershipsByCategoryId.get(String(membership.categoryId)) ?? [];
    list.push(membership);
    membershipsByCategoryId.set(String(membership.categoryId), list);
  }

  const projectedCategories: MenuProjectionCategory[] = visibleCategories.map((category) => {
    const categoryMenuIds = getCategoryMenuIds(category);
    const categoryMemberships = membershipsByCategoryId.get(String(category._id)) ?? [];
    const categoryItems: MenuProjectionItem[] = categoryMemberships.flatMap((membership) => {
      const item = itemById.get(String(membership.itemId));
      if (!item) return [];
      const itemVariants = Array.isArray(item.variants) ? item.variants : [];
      const itemDietaryTags = Array.isArray(item.dietaryTags) ? item.dietaryTags : [];
      const itemAllergens = Array.isArray(item.allergens) ? item.allergens : [];
      const itemModifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
      const itemAvailableFor = Array.isArray(item.availableFor) ? item.availableFor : undefined;
      const itemSearchKeywords = Array.isArray(item.searchKeywords) ? item.searchKeywords : [];
      return [
        {
          id: String(item._id),
          categoryId: String(category._id),
          primaryCategoryId:
            primaryCategoryIdByItemId.get(String(item._id)) ?? String(category._id),
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          priceMinor: item.priceMinor,
          currency: item.currency,
          variants: [...itemVariants]
            .sort((left, right) => left.order - right.order)
            .map((variant) => ({
              id: String(variant._id),
              name: variant.name,
              priceMinor: variant.priceMinor,
              order: variant.order,
              isDefault: variant.isDefault,
              soldOut: variant.soldOut ?? false,
            })),
          ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
          dietaryTags: itemDietaryTags,
          allergens: itemAllergens,
          modifiers: itemModifiers.map(normalizeModifierGroup),
          soldOut: item.soldOut,
          status: normalizeItemStatus(item),
          isHidden: item.isHidden,
          ...(itemAvailableFor ? { availableFor: itemAvailableFor } : {}),
          ...(item.schedule
            ? {
                schedule: {
                  days: item.schedule.days,
                  startTime: item.schedule.startTime,
                  endTime: item.schedule.endTime,
                },
              }
            : {}),
          ...(item.taxClassId ? { taxClassId: item.taxClassId } : {}),
          featured: item.featured ?? false,
          searchKeywords: itemSearchKeywords,
          ...(item.stationIds ? { stationIds: item.stationIds } : {}),
          ...(typeof item.estimatedPrepMinutes === 'number'
            ? { estimatedPrepMinutes: item.estimatedPrepMinutes }
            : {}),
        },
      ];
    });

    return {
      id: String(category._id),
      menuId: String(category.menuId),
      menuIds: categoryMenuIds,
      name: category.name,
      ...(category.description ? { description: category.description } : {}),
      order: category.order,
      stationIds: category.stationIds,
      items: categoryItems,
    };
  });

  const categoryById = new Map(projectedCategories.map((category) => [category.id, category]));
  const projectedMenus: MenuProjectionMenu[] = visibleMenus.map((menu) => ({
    id: String(menu._id),
    name: menu.name,
    order: menu.order,
    status: normalizeMenuStatus(menu),
    schedule: menu.schedule
      ? {
          days: menu.schedule.days,
          startTime: menu.schedule.startTime,
          endTime: menu.schedule.endTime,
        }
      : undefined,
    categories: visibleCategories
      .filter((category) => getCategoryMenuIds(category).includes(String(menu._id)))
      .map((category) => categoryById.get(String(category._id)))
      .filter((category): category is MenuProjectionCategory => Boolean(category)),
  }));

  return {
    menus: projectedMenus,
    categories: projectedCategories,
    items: projectedCategories.flatMap((category) => category.items),
  };
}

export async function loadPrimaryCategoryStationIdsByItemId(
  connection: Connection,
  restaurantId: Types.ObjectId,
  itemIds: Types.ObjectId[],
): Promise<Map<string, Types.ObjectId[]>> {
  const { Category, CategoryItemMembership, Item } = getModels(connection);
  const [items, memberships] = await Promise.all([
    Item.find({ restaurantId, _id: { $in: itemIds } }, { categoryId: 1 })
      .lean()
      .exec(),
    CategoryItemMembership.find({ restaurantId, itemId: { $in: itemIds } })
      .sort({ order: 1, createdAt: 1 })
      .lean()
      .exec(),
  ]);

  const primaryCategoryIdByItemId = new Map<string, string>();
  for (const membership of memberships) {
    const itemId = String(membership.itemId);
    if (!primaryCategoryIdByItemId.has(itemId)) {
      primaryCategoryIdByItemId.set(itemId, String(membership.categoryId));
    }
  }
  for (const item of items) {
    const itemId = String(item._id);
    if (!primaryCategoryIdByItemId.has(itemId)) {
      primaryCategoryIdByItemId.set(itemId, String(item.categoryId));
    }
  }

  const categoryIds = Array.from(new Set(primaryCategoryIdByItemId.values()));
  const categories =
    categoryIds.length > 0
      ? await Category.find({ restaurantId, _id: { $in: categoryIds } }, { stationIds: 1 })
          .lean()
          .exec()
      : [];
  const stationIdsByCategoryId = new Map(
    categories.map((category) => [String(category._id), category.stationIds ?? []]),
  );

  const result = new Map<string, Types.ObjectId[]>();
  for (const [itemId, categoryId] of primaryCategoryIdByItemId) {
    result.set(itemId, stationIdsByCategoryId.get(categoryId) ?? []);
  }
  return result;
}

export function resolvePrimaryStationIdForItem(
  itemStations: Types.ObjectId[] | null | undefined,
  categoryStations: Types.ObjectId[] | null | undefined,
): Types.ObjectId | null {
  return resolvePrimaryStationId(itemStations ?? null, categoryStations ?? []);
}
