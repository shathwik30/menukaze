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
    <div>
      {/* Page header */}
      <div
        style={{
          padding: '14px 40px 12px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 3,
              height: 28,
              borderRadius: 99,
              background: 'var(--mk-saffron-500)',
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--mk-saffron-700)',
              }}
            >
              Catalog
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'var(--mk-ink-950)',
                lineHeight: 1.2,
              }}
            >
              Menu
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mk-ink-400)', maxWidth: 400 }}>
            Curate categories and items. Changes publish to your storefront, kiosk and QR menus
            instantly.
          </p>
        </div>
        {canEditMenu ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 36,
                padding: '0 14px',
                borderRadius: 9,
                border: '1px solid var(--mk-ink-200)',
                background: 'white',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--mk-ink-700)',
                cursor: 'pointer',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                style={{ width: 14, height: 14 }}
                aria-hidden
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Import CSV
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ padding: '20px 40px 48px' }}>
        <MenuManagerClient
          menus={menuTree}
          currencyLabel={`${currency} (${locale})`}
          availableItems={availableItems}
          canEdit={canEditMenu}
          canToggleAvailability={canToggleAvailability}
        />
      </div>
    </div>
  );
}
