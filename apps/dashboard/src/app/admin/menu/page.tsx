import { Types } from 'mongoose';
import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { formatMoney, type CurrencyCode } from '@menukaze/shared';
import { requireOnboarded } from '@/lib/session';
import { MenuManagerClient, type ManagerMenu } from './menu-manager-client';

export const dynamic = 'force-dynamic';

export default async function MenuManagementPage() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const conn = await getMongoConnection('live');
  const { Restaurant, Menu, Category, Item } = getModels(conn);

  const [restaurant, menus, categories, items] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Menu.find({ restaurantId }).sort({ order: 1, createdAt: 1 }).lean().exec(),
    Category.find({ restaurantId }).sort({ order: 1 }).lean().exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).lean().exec(),
  ]);

  const currency = (restaurant?.currency ?? 'USD') as CurrencyCode;
  const locale = restaurant?.locale ?? 'en-US';

  const menuTree: ManagerMenu[] = menus.map((menu) => ({
    id: String(menu._id),
    name: menu.name,
    order: menu.order,
    categories: categories
      .filter((c) => String(c.menuId) === String(menu._id))
      .map((category) => ({
        id: String(category._id),
        name: category.name,
        order: category.order,
        items: items
          .filter((i) => String(i.categoryId) === String(category._id))
          .map((item) => ({
            id: String(item._id),
            name: item.name,
            description: item.description,
            priceMinor: item.priceMinor,
            priceLabel: formatMoney(item.priceMinor, currency, locale),
            dietaryTags: item.dietaryTags,
            soldOut: item.soldOut,
            imageUrl: item.imageUrl,
          })),
      })),
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Menu</h1>
          <p className="text-muted-foreground text-sm">
            Edit categories, items, modifiers, and availability
          </p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      <MenuManagerClient menus={menuTree} currencyLabel={`${currency} (${locale})`} />
    </main>
  );
}
