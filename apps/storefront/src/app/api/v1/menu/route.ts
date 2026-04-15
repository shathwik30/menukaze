import { type NextRequest } from 'next/server';
import { getModels, getMongoConnection } from '@menukaze/db';
import { filterActiveMenus } from '@menukaze/shared';
import { apiError, corsOptions, jsonOk, resolveApiKey } from '../_lib/auth';
import { rateLimitFor, rateLimitHeaders } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function OPTIONS(): Promise<Response> {
  return corsOptions();
}

export async function GET(request: NextRequest): Promise<Response> {
  const ctx = await resolveApiKey(request);
  if (ctx instanceof Response) return ctx;

  const rl = await rateLimitFor(ctx, 'v1:menu');
  if (!rl.ok) {
    return apiError('rate_limit_exceeded', 'Rate limit exceeded. See Retry-After.', {
      headers: rateLimitHeaders(rl),
    });
  }
  const rateHeaders = rateLimitHeaders(rl);

  const url = new URL(request.url);
  const includeInactive = url.searchParams.get('include_inactive') === 'true';

  const conn = await getMongoConnection('live');
  const { Restaurant, Menu, Category, Item } = getModels(conn);

  const [restaurant, menus, categories, items] = await Promise.all([
    Restaurant.findById(ctx.restaurantId, { timezone: 1, currency: 1 }).lean().exec(),
    Menu.find({ restaurantId: ctx.restaurantId }).sort({ order: 1 }).lean().exec(),
    Category.find({ restaurantId: ctx.restaurantId }).sort({ order: 1 }).lean().exec(),
    Item.find({ restaurantId: ctx.restaurantId }).sort({ createdAt: 1 }).lean().exec(),
  ]);

  const visibleMenus = includeInactive
    ? menus
    : restaurant
      ? filterActiveMenus(menus, restaurant.timezone)
      : menus;
  const visibleMenuIds = new Set(visibleMenus.map((m) => String(m._id)));
  const visibleCategories = categories.filter((c) => visibleMenuIds.has(String(c.menuId)));
  const visibleCategoryIds = new Set(visibleCategories.map((c) => String(c._id)));
  const visibleItems = items.filter((i) => visibleCategoryIds.has(String(i.categoryId)));

  return jsonOk(
    {
      menus: visibleMenus.map((m) => ({
        id: String(m._id),
        name: m.name,
        order: m.order,
        schedule: m.schedule ?? null,
      })),
      categories: visibleCategories.map((c) => ({
        id: String(c._id),
        menu_id: String(c.menuId),
        name: c.name,
        order: c.order,
      })),
      items: visibleItems.map((i) => ({
        id: String(i._id),
        category_id: String(i.categoryId),
        name: i.name,
        description: i.description ?? null,
        price_minor: i.priceMinor,
        currency: i.currency,
        image_url: i.imageUrl ?? null,
        dietary_tags: i.dietaryTags,
        sold_out: i.soldOut,
        modifiers: i.modifiers.map((g) => ({
          name: g.name,
          required: g.required,
          max: g.max,
          options: g.options.map((o) => ({ name: o.name, price_minor: o.priceMinor })),
        })),
      })),
    },
    { headers: rateHeaders },
  );
}
