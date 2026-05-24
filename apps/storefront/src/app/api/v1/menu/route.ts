import { type NextRequest } from 'next/server';
import { getModels, getMongoConnection, loadMenuProjection } from '@menukaze/db';
import { apiError, corsOptions, jsonOk, resolveApiKey, withApiCors } from '../_lib/auth';
import { rateLimitFor, rateLimitHeaders } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest): Promise<Response> {
  return corsOptions(request);
}

export async function GET(request: NextRequest): Promise<Response> {
  const ctx = await resolveApiKey(request);
  if (ctx instanceof Response) return ctx;

  const rl = await rateLimitFor(ctx, 'v1:menu');
  if (!rl.ok) {
    return withApiCors(
      request,
      apiError('rate_limit_exceeded', 'Rate limit exceeded. See Retry-After.', {
        headers: rateLimitHeaders(rl),
      }),
    );
  }
  const rateHeaders = rateLimitHeaders(rl);

  const url = new URL(request.url);
  const includeInactive = url.searchParams.get('include_inactive') === 'true';

  const conn = await getMongoConnection(ctx.dbName);
  const { Restaurant } = getModels(conn);

  const restaurant = await Restaurant.findById(ctx.restaurantId, { timezone: 1, currency: 1 })
    .lean()
    .exec();
  const projection = await loadMenuProjection(conn, {
    restaurantId: ctx.restaurantId,
    timeZone: restaurant?.timezone ?? 'UTC',
    channel: 'api',
    includeInactiveMenus: includeInactive,
  });

  return withApiCors(
    request,
    jsonOk(
      {
        menus: projection.menus.map((m) => ({
          id: m.id,
          name: m.name,
          order: m.order,
          schedule: m.schedule ?? null,
        })),
        categories: projection.categories.map((c) => ({
          id: c.id,
          menu_id: c.menuId,
          menu_ids: c.menuIds,
          name: c.name,
          description: c.description ?? null,
          order: c.order,
        })),
        items: projection.items.map((i) => ({
          id: i.id,
          category_id: i.categoryId,
          name: i.name,
          description: i.description ?? null,
          price_minor: i.priceMinor,
          currency: i.currency,
          image_url: i.imageUrl ?? null,
          dietary_tags: i.dietaryTags,
          allergens: i.allergens,
          featured: i.featured,
          search_keywords: i.searchKeywords,
          tax_class_id: i.taxClassId ?? null,
          variants: i.variants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            price_minor: variant.priceMinor,
            order: variant.order,
            is_default: variant.isDefault,
            sold_out: variant.soldOut,
          })),
          sold_out: i.soldOut,
          modifiers: i.modifiers.map((g) => ({
            name: g.name,
            required: g.min > 0,
            min: g.min,
            max: g.max,
            options: g.options.map((o) => ({ name: o.name, price_minor: o.priceMinor })),
          })),
        })),
      },
      { headers: rateHeaders },
    ),
  );
}
