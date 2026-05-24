import type { Connection, Types } from 'mongoose';
import {
  computeCartPrepMinutes,
  computeTaxForLines,
  DEFAULT_PREP_MINUTES,
  isMenuScheduleActive,
  resolvePrimaryStationId,
  validateModifierSelection,
  type OrderChannel,
  type TaxClass,
  type TaxRule,
} from '@menukaze/shared';
import { parseObjectIds } from './object-id';
import { getModels } from './models';
import { loadPrimaryCategoryStationIdsByItemId } from './menu-projection';
import { pickLeastLoadedStationId } from './station-load';

export interface MenuCommerceLineInput {
  itemId: string;
  quantity: number;
  variantId?: string;
  modifiers: Array<{ groupName: string; optionName: string; priceMinor?: number }>;
  notes?: string;
}

export interface MenuCommerceRestaurantConfig {
  currency: string;
  timezone?: string | null;
  estimatedPrepMinutes?: number | null;
  taxRules?: TaxRule[] | null;
  taxClasses?: TaxClass[] | null;
}

export interface MenuCommerceSnapshotLine {
  itemId: Types.ObjectId;
  name: string;
  priceMinor: number;
  variantId?: Types.ObjectId;
  variantName?: string;
  quantity: number;
  modifiers: { groupName: string; optionName: string; priceMinor: number }[];
  notes?: string;
  taxClassId?: string;
  taxClassName?: string;
  taxMinor?: number;
  lineTotalMinor: number;
  stationId?: Types.ObjectId;
}

export interface MenuCommercePricing {
  snapshotLines: MenuCommerceSnapshotLine[];
  subtotalMinor: number;
  taxMinor: number;
  surchargeMinor: number;
  prepMinutes: number;
}

interface BuildMenuCommercePricingOptions {
  connection: Connection;
  restaurantId: Types.ObjectId;
  restaurant: MenuCommerceRestaurantConfig;
  lines: MenuCommerceLineInput[];
  channel: OrderChannel;
  annotateItemName?: (name: string) => string;
}

export async function buildMenuCommercePricing({
  connection,
  restaurantId,
  restaurant,
  lines,
  channel,
  annotateItemName,
}: BuildMenuCommercePricingOptions): Promise<MenuCommercePricing | { error: string }> {
  const { Item } = getModels(connection);
  const itemIds = parseObjectIds(lines.map((line) => line.itemId));
  if (!itemIds) return { error: 'Unknown item.' };

  const items = await Item.find({ restaurantId, _id: { $in: itemIds } }).exec();
  const itemsById = new Map(items.map((item) => [String(item._id), item]));
  const categoryStationsByItemId = await loadPrimaryCategoryStationIdsByItemId(
    connection,
    restaurantId,
    itemIds,
  );

  const snapshotLines: MenuCommerceSnapshotLine[] = [];
  const taxableLines: Array<{ subtotalMinor: number; taxClassId?: string }> = [];
  let subtotalMinor = 0;

  for (const line of lines) {
    const item = itemsById.get(line.itemId);
    if (!item) return { error: 'Item no longer available.' };
    const itemAvailableFor = Array.isArray(item.availableFor) ? item.availableFor : [];
    const itemModifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
    const itemVariants = Array.isArray(item.variants) ? item.variants : [];
    if (item.soldOut) return { error: `${item.name} is sold out.` };
    if (item.status !== 'published') return { error: `${item.name} is unavailable.` };
    if (item.isHidden) return { error: `${item.name} is unavailable.` };
    if (itemAvailableFor.length > 0 && !itemAvailableFor.includes(channel)) {
      return { error: `${item.name} is unavailable.` };
    }
    if (!isMenuScheduleActive(item.schedule, restaurant.timezone ?? 'UTC')) {
      return { error: `${item.name} is not available right now.` };
    }
    if (item.currency !== restaurant.currency)
      return { error: `Currency mismatch for ${item.name}.` };

    const modifierResult = validateModifierSelection(itemModifiers, line.modifiers, item.name);
    if (!modifierResult.ok) return { error: modifierResult.error };

    const variant =
      line.variantId && itemVariants.length > 0
        ? itemVariants.find((entry) => String(entry._id) === line.variantId)
        : (itemVariants.find((entry) => entry.isDefault) ?? itemVariants[0]);
    if (line.variantId && !variant) return { error: `Variant unavailable for ${item.name}.` };
    if (variant?.soldOut) return { error: `${variant.name} is sold out for ${item.name}.` };

    const basePriceMinor = variant?.priceMinor ?? item.priceMinor;
    const unitMinor =
      basePriceMinor +
      modifierResult.modifiers.reduce((sum, modifier) => sum + modifier.priceMinor, 0);
    const lineTotalMinor = unitMinor * line.quantity;
    subtotalMinor += lineTotalMinor;

    const itemStations = item.stationIds ?? [];
    const categoryStations = categoryStationsByItemId.get(String(item._id)) ?? [];
    const candidates = itemStations.length > 0 ? itemStations : categoryStations;
    const stationId =
      candidates.length > 1
        ? await pickLeastLoadedStationId(connection, restaurantId, candidates)
        : resolvePrimaryStationId(item.stationIds ?? null, categoryStations);

    snapshotLines.push({
      itemId: item._id,
      name: annotateItemName ? annotateItemName(item.name) : item.name,
      priceMinor: basePriceMinor,
      ...(variant?._id ? { variantId: variant._id, variantName: variant.name } : {}),
      quantity: line.quantity,
      modifiers: modifierResult.modifiers,
      ...(line.notes ? { notes: line.notes } : {}),
      ...(item.taxClassId ? { taxClassId: item.taxClassId } : {}),
      lineTotalMinor,
      ...(stationId ? { stationId } : {}),
    });
    taxableLines.push({ subtotalMinor: lineTotalMinor, taxClassId: item.taxClassId });
  }

  const taxBreakdown = computeTaxForLines(
    taxableLines,
    restaurant.taxRules ?? [],
    restaurant.taxClasses ?? [],
  );
  const taxClassById = new Map(
    (restaurant.taxClasses ?? []).map((taxClass) => [taxClass.id, taxClass]),
  );
  const snapshotLinesWithTax = snapshotLines.map((line, index) => {
    const taxable = taxableLines[index];
    if (!taxable?.taxClassId) return line;
    const taxClass = taxClassById.get(taxable.taxClassId);
    if (!taxClass) return line;
    const lineTax = computeTaxForLines(
      [{ subtotalMinor: line.lineTotalMinor, taxClassId: taxable.taxClassId }],
      [],
      [taxClass],
    );
    return {
      ...line,
      taxClassName: taxClass.name,
      taxMinor: lineTax.taxMinor,
    };
  });

  return {
    snapshotLines: snapshotLinesWithTax,
    subtotalMinor,
    taxMinor: taxBreakdown.taxMinor,
    surchargeMinor: taxBreakdown.surchargeMinor,
    prepMinutes: computeCartPrepMinutes(
      lines.map((line) => ({
        estimatedPrepMinutes: itemsById.get(line.itemId)?.estimatedPrepMinutes ?? null,
      })),
      restaurant.estimatedPrepMinutes ?? DEFAULT_PREP_MINUTES,
    ),
  };
}
