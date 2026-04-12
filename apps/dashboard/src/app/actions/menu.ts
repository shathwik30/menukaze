'use server';

import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { requireOnboarded } from '@/lib/session';
import { parseMenuCsvImport } from '@/lib/menu-import';

const itemInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** Price in MAJOR units (e.g. 12.99) — converted to minor units server-side. */
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

/** Decimal places per ISO 4217 currency. JPY/KRW are zero-decimal. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW']);

function majorToMinor(major: number, currency: string): number {
  const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
  return Math.round(major * 10 ** decimals);
}

/**
 * Step 4 of the onboarding wizard — Menu Setup.
 *
 * Creates the user's first Menu, one-or-more Categories under it, and the
 * imported Items atomically inside a Mongoose session. Refuses if the
 * restaurant already has any items (re-onboarding guard).
 */
export async function createMenuStarterAction(raw: unknown): Promise<CreateMenuStarterResult> {
  const session = await requireOnboarded();

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Invalid form data.',
    };
  }
  const input = parsed.data;

  const conn = await getMongoConnection('live');
  const { Restaurant, Menu, Category, Item } = getModels(conn);
  const restaurantId = new Types.ObjectId(session.restaurantId);

  // Pull the restaurant once to know which currency to stamp on items.
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

  // Re-onboarding guard: if any items already exist, bounce.
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
      const menuIdLocal = menu._id as Types.ObjectId;
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
        const categoryIdLocal = category._id as Types.ObjectId;
        if (!firstCategoryId) firstCategoryId = categoryIdLocal;

        const itemDocs = categoryInput.items.map((it) => ({
          restaurantId,
          categoryId: categoryIdLocal,
          name: it.name,
          description: it.description,
          priceMinor: majorToMinor(it.priceMajor, currency),
          currency,
          dietaryTags: [] as string[],
          modifiers: [] as never[],
          soldOut: false,
        }));
        await Item.create(itemDocs, { session: dbSession });
        itemCount += itemDocs.length;
      }

      // Advance the wizard pointer so /onboarding knows where to route next.
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
