'use server';

import type { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { PermissionDeniedError, requireFlags } from '@/lib/session';
import { validationError } from '@/lib/action-helpers';
import { parseMenuCsvImport } from '@/lib/menu-import';

const itemInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** User-entered major-unit price; stored as integer minor units. */
  priceMajor: z.number().nonnegative().finite(),
  description: z.string().trim().max(1000).optional(),
});

const manualInputSchema = z.object({
  mode: z.literal('manual'),
  menuName: z.string().trim().min(1).max(120).default('Main Menu'),
  categoryName: z.string().trim().min(1).max(120),
  items: z.array(itemInputSchema).min(1).max(50),
});

const csvInputSchema = z.object({
  mode: z.literal('csv'),
  menuName: z.string().trim().min(1).max(120).default('Main Menu'),
  csvText: z.string().trim().min(1),
  defaultCategoryName: z.string().trim().min(1).max(120).default('General'),
});

const inputSchema = z.discriminatedUnion('mode', [manualInputSchema, csvInputSchema]);

export type CreateMenuStarterInput = z.infer<typeof inputSchema>;

export type CreateMenuStarterResult =
  | { ok: true; menuId: string; categoryId: string; itemCount: number }
  | { ok: false; error: string };

const ZERO_DECIMAL = new Set(['JPY', 'KRW']);

function majorToMinor(major: number, currency: string): number {
  const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
  return Math.round(major * 10 ** decimals);
}

/**
 * Creates the first menu tree during onboarding and advances the wizard.
 */
export async function createMenuStarterAction(raw: unknown): Promise<CreateMenuStarterResult> {
  let restaurantId;
  try {
    ({ restaurantId } = await requireFlags(['menu.edit']));
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return { ok: false, error: 'You do not have permission to set up the menu.' };
    }
    throw error;
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error, 'Invalid form data.');
  const input = parsed.data;

  const conn = await getMongoConnection('live');
  const { Restaurant, Menu, Category, Item } = getModels(conn);

  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
  const currency = restaurant.currency;

  let categoriesToCreate: Array<{
    name: string;
    items: Array<{ name: string; priceMajor: number; description?: string }>;
  }> | null = null;

  try {
    categoriesToCreate =
      input.mode === 'manual'
        ? [{ name: input.categoryName.trim(), items: input.items }]
        : parseMenuCsvImport(input.csvText, input.defaultCategoryName);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid CSV input.';
    return { ok: false, error: message };
  }

  const existingCount = await Item.countDocuments({ restaurantId }).exec();
  if (existingCount > 0) {
    return { ok: false, error: 'This restaurant already has menu items.' };
  }

  const dbSession = await conn.startSession();
  try {
    let menuId: Types.ObjectId | null = null;
    let firstCategoryId: Types.ObjectId | null = null;
    let itemCount = 0;

    await dbSession.withTransaction(async () => {
      const [menu] = await Menu.create([{ restaurantId, name: input.menuName, order: 0 }], {
        session: dbSession,
      });
      if (!menu) throw new APIError('internal_error');
      const menuIdLocal = menu._id;
      menuId = menuIdLocal;

      for (const [categoryOrder, categoryInput] of categoriesToCreate.entries()) {
        const [category] = await Category.create(
          [
            {
              restaurantId,
              menuId: menuIdLocal,
              name: categoryInput.name,
              order: categoryOrder,
            },
          ],
          { session: dbSession },
        );
        if (!category) throw new APIError('internal_error');
        const categoryIdLocal = category._id;
        if (!firstCategoryId) firstCategoryId = categoryIdLocal;

        const itemDocs = categoryInput.items.map((it) => ({
          restaurantId,
          categoryId: categoryIdLocal,
          name: it.name,
          description: it.description,
          priceMinor: majorToMinor(it.priceMajor, currency),
          currency,
          dietaryTags: [],
          modifiers: [],
          soldOut: false,
        }));
        await Item.create(itemDocs, { session: dbSession, ordered: true });
        itemCount += itemDocs.length;
      }

      await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { onboardingStep: 'tables' } },
        { session: dbSession },
      ).exec();
    });

    if (!menuId || !firstCategoryId) {
      return { ok: false, error: 'Could not create the menu. Please try again.' };
    }
    return {
      ok: true,
      menuId: String(menuId),
      categoryId: String(firstCategoryId),
      itemCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return { ok: false, error: `Could not create the menu: ${message}` };
  } finally {
    await dbSession.endSession();
  }
}
