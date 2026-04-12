import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import { requireAnyPageFlag } from '@/lib/session';
import { MenuManagerClient, type ManagerItemChoice, type ManagerMenu } from './menu-manager-client';

export const dynamic = 'force-dynamic';

export default async function MenuManagementPage() {
  const { restaurantId, permissions } = await requireAnyPageFlag([
    'menu.view',
    'menu.edit',
    'menu.toggle_availability',
    'menu.schedule',
  ]);
  const canEditMenu = permissions.includes('menu.edit');
  const canToggleAvailability = permissions.includes('menu.toggle_availability');

  const conn = await getMongoConnection('live');
  const { Restaurant, Menu, Category, Item } = getModels(conn);

  const [restaurant, menus, categories, items] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Menu.find({ restaurantId }).sort({ order: 1, createdAt: 1 }).lean().exec(),
    Category.find({ restaurantId }).sort({ order: 1 }).lean().exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).lean().exec(),
  ]);

  const currency = currencyCodeOrDefault(restaurant?.currency);
  const locale = restaurant?.locale ?? 'en-US';
  const itemNameById = new Map(items.map((item) => [String(item._id), item.name]));
  const categoryNameById = new Map(
    categories.map((category) => [String(category._id), category.name]),
  );

  const menuTree: ManagerMenu[] = menus.map((menu) => ({
    id: String(menu._id),
    name: menu.name,
    order: menu.order,
    schedule: menu.schedule
      ? {
          days: menu.schedule.days,
          startTime: menu.schedule.startTime,
          endTime: menu.schedule.endTime,
        }
      : undefined,
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
            modifiers: item.modifiers.map((group) => ({
              name: group.name,
              required: group.required,
              max: group.max,
              options: group.options.map((option) => ({
                name: option.name,
                priceMinor: option.priceMinor,
              })),
            })),
            comboOf: item.comboOf?.map((comboId) => String(comboId)) ?? [],
            comboItemNames:
              item.comboOf?.map((comboId) => itemNameById.get(String(comboId)) ?? 'Unknown item') ??
              [],
          })),
      })),
  }));
  const availableItems: ManagerItemChoice[] = items.map((item) => ({
    id: String(item._id),
    name: item.name,
    categoryName: categoryNameById.get(String(item.categoryId)) ?? 'Menu',
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Menu</h1>
          <p className="text-muted-foreground text-sm">
            Edit categories, items, schedules, modifiers, and availability
          </p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      <MenuManagerClient
        menus={menuTree}
        currencyLabel={`${currency} (${locale})`}
        availableItems={availableItems}
        canEdit={canEditMenu}
        canToggleAvailability={canToggleAvailability}
      />
    </main>
  );
}
