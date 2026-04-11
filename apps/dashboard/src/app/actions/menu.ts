'use server';

import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { requireOnboarded } from '@/lib/session';

const itemInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** Price in MAJOR units (e.g. 12.99) — converted to minor units server-side. */
  priceMajor: z.number().nonnegative().finite(),
  description: z.string().trim().max(1000).optional(),
});

const inputSchema = z.object({
  menuName: z.string().trim().min(1).max(120).default('Main Menu'),
  categoryName: z.string().trim().min(1).max(120),
  items: z.array(itemInputSchema).min(1).max(50),
});

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
 * Step 4 of the onboarding wizard — Menu Setup (manual entry only; CSV import
 * is post-MVP per the product doc §20).
 *
 * Creates the user's first Menu, one Category under it, and N Items under
 * the category atomically inside a Mongoose session. Refuses if the
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

  // Re-onboarding guard: if any items already exist, bounce.
  const existingCount = await Item.countDocuments({ restaurantId }).exec();
  if (existingCount > 0) {
    return { ok: false, error: 'This restaurant already has menu items.' };
  }

  const dbSession = await conn.startSession();
  try {
    let menuId: Types.ObjectId | null = null;
    let categoryIdOut: Types.ObjectId | null = null;

    await dbSession.withTransaction(async () => {
      const [menu] = await Menu.create([{ restaurantId, name: input.menuName, order: 0 }], {
        session: dbSession,
      });
      if (!menu) throw new APIError('internal_error');
      const menuIdLocal = menu._id as Types.ObjectId;
      menuId = menuIdLocal;

      const [category] = await Category.create(
        [{ restaurantId, menuId: menuIdLocal, name: input.categoryName, order: 0 }],
        { session: dbSession },
      );
      if (!category) throw new APIError('internal_error');
      const categoryIdLocal = category._id as Types.ObjectId;
      categoryIdOut = categoryIdLocal;

      const itemDocs = input.items.map((it) => ({
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

      // Advance the wizard pointer so /onboarding knows where to route next.
      await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { onboardingStep: 'tables' } },
        { session: dbSession },
      ).exec();
    });

    if (!menuId || !categoryIdOut) {
      return { ok: false, error: 'Could not create the menu. Please try again.' };
    }
    return {
      ok: true,
      menuId: String(menuId),
      categoryId: String(categoryIdOut),
      itemCount: input.items.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return { ok: false, error: `Could not create the menu: ${message}` };
  } finally {
    await dbSession.endSession();
  }
}
