'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeTax, type TaxRule } from '@menukaze/shared';
import { cartItemCount, cartLineKey, cartSubtotalMinor, useKioskCart } from '@/stores/cart';
import { useIdleReset } from '@/hooks/use-idle-reset';
import { PinOverlay } from '@/components/pin-overlay';
import { ItemConfigurator } from './item-configurator';

export interface KioskMenu {
  id: string;
  name: string;
}
export interface KioskCategory {
  id: string;
  name: string;
  menuId: string;
}
export interface KioskItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  priceMinor: number;
  priceLabel: string;
  imageUrl?: string;
  soldOut: boolean;
  comboItemNames: string[];
  modifiers: Array<{
    name: string;
    required: boolean;
    max: number;
    options: Array<{ name: string; priceMinor: number; priceLabel: string }>;
  }>;
}

interface Props {
  restaurantId: string;
  restaurantName: string;
  currency: string;
  locale: string;
  menus: KioskMenu[];
  categories: KioskCategory[];
  items: KioskItem[];
  taxRules: TaxRule[];
  minimumOrderMinor: number;
}

interface ConfiguringItem {
  item: KioskItem;
}

export function MenuClient({
  restaurantId,
  restaurantName: _restaurantName,
  currency,
  locale,
  menus,
  categories,
  items,
  taxRules,
  minimumOrderMinor,
}: Props) {
  const router = useRouter();
  useIdleReset();

  // Cart
  const setRestaurant = useKioskCart((s) => s.setRestaurant);
  const lines = useKioskCart((s) => s.lines);
  const orderMode = useKioskCart((s) => s.orderMode);
  const incrementLine = useKioskCart((s) => s.incrementLine);
  const decrementLine = useKioskCart((s) => s.decrementLine);
  const removeLine = useKioskCart((s) => s.removeLine);
  const addLine = useKioskCart((s) => s.addLine);

  const [activeMenuId, setActiveMenuId] = useState(menus[0]?.id ?? '');
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [configuring, setConfiguring] = useState<ConfiguringItem | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);

  // Bind cart to this restaurant
  useEffect(() => {
    setRestaurant(restaurantId, currency, locale);
  }, [restaurantId, currency, locale, setRestaurant]);

  // If no mode was chosen, bounce back
  useEffect(() => {
    if (!orderMode) router.replace('/kiosk/mode');
  }, [orderMode, router]);

  const fmt = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.menuId === activeMenuId),
    [categories, activeMenuId],
  );

  // Default to first category when menu changes
  useEffect(() => {
    setActiveCategoryId(visibleCategories[0]?.id ?? '');
  }, [visibleCategories]);

  const visibleItems = useMemo(
    () =>
      activeCategoryId
        ? items.filter((i) => i.categoryId === activeCategoryId)
        : items.filter((i) => visibleCategories.some((c) => c.id === i.categoryId)),
    [items, activeCategoryId, visibleCategories],
  );

  const subtotal = useMemo(() => cartSubtotalMinor(lines), [lines]);
  const { surchargeMinor } = useMemo(() => computeTax(subtotal, taxRules), [subtotal, taxRules]);
  const total = subtotal + surchargeMinor;
  const itemCount = cartItemCount(lines);
  const belowMinimum = minimumOrderMinor > 0 && subtotal > 0 && subtotal < minimumOrderMinor;

  function flashAdded(itemId: string) {
    setJustAddedId(itemId);
    window.setTimeout(() => setJustAddedId(null), 1200);
  }

  function handleAddSimple(item: KioskItem) {
    addLine({ itemId: item.id, name: item.name, priceMinor: item.priceMinor, modifiers: [] });
    flashAdded(item.id);
  }

  function handleOpenConfigurator(item: KioskItem) {
    setConfiguring({ item });
  }

  function handleConfigured() {
    if (configuring) flashAdded(configuring.item.id);
    setConfiguring(null);
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <button
          type="button"
          onClick={() => router.push('/kiosk/mode')}
          className="text-muted-foreground text-sm underline"
        >
          ← Back
        </button>
        <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {orderMode === 'dine_in' ? 'Dine In' : 'Takeaway'}
        </span>
        <div className="w-16" /> {/* spacer */}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Category sidebar ───────────────────────────────── */}
        <aside className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-slate-50 p-3">
          {menus.length > 1 && (
            <div className="mb-2">
              {menus.map((menu) => (
                <button
                  key={menu.id}
                  type="button"
                  onClick={() => setActiveMenuId(menu.id)}
                  className={`mb-1 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide ${
                    menu.id === activeMenuId
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {menu.name}
                </button>
              ))}
              <hr className="my-2" />
            </div>
          )}
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategoryId(cat.id)}
              className={`rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors ${
                cat.id === activeCategoryId
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </aside>

        {/* ── Item grid ──────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-5">
          {visibleItems.length === 0 ? (
            <p className="text-muted-foreground py-20 text-center">
              No items in this category right now.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {visibleItems.map((item) => {
                const inCart = lines.reduce(
                  (sum, l) => (l.itemId === item.id ? sum + l.quantity : sum),
                  0,
                );
                const isJustAdded = justAddedId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-opacity ${
                      item.soldOut ? 'opacity-50' : ''
                    }`}
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-36 w-full object-cover" />
                    ) : (
                      <div className="flex h-36 items-center justify-center bg-slate-100 text-4xl">
                        🍴
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-1 p-4">
                      <p className="font-semibold leading-tight">{item.name}</p>
                      {item.description ? (
                        <p className="text-muted-foreground line-clamp-2 text-xs">
                          {item.description}
                        </p>
                      ) : null}
                      {item.comboItemNames.length > 0 ? (
                        <p className="text-muted-foreground text-xs">
                          Includes: {item.comboItemNames.join(', ')}
                        </p>
                      ) : null}
                      <p className="mt-auto pt-2 font-mono font-bold">{item.priceLabel}</p>
                    </div>
                    <div className="px-4 pb-4">
                      {item.soldOut ? (
                        <span className="block text-center text-xs font-medium uppercase text-red-500">
                          Sold out
                        </span>
                      ) : item.modifiers.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenConfigurator(item)}
                          className={`h-12 w-full rounded-xl text-base font-semibold transition-colors ${
                            isJustAdded
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-900 text-white active:bg-slate-700'
                          }`}
                        >
                          {isJustAdded
                            ? 'Added ✓'
                            : inCart > 0
                              ? `Add more (${inCart})`
                              : 'Customize'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddSimple(item)}
                          className={`h-12 w-full rounded-xl text-base font-semibold transition-colors ${
                            isJustAdded
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-900 text-white active:bg-slate-700'
                          }`}
                        >
                          {isJustAdded ? 'Added ✓' : inCart > 0 ? `Add more (${inCart})` : 'Add'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ── Cart bar (sticky bottom) ───────────────────────── */}
      {itemCount > 0 && (
        <footer className="shrink-0 border-t bg-white px-6 py-4">
          {belowMinimum ? (
            <p className="mb-2 text-center text-xs text-amber-700">
              Minimum order {fmt(minimumOrderMinor)} — add more items
            </p>
          ) : null}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowCart((v) => !v)}
              className="flex-1 rounded-2xl border px-4 py-3 text-left text-sm font-medium"
            >
              {itemCount} item{itemCount !== 1 ? 's' : ''} · {fmt(total)}
              <span className="text-muted-foreground ml-2 text-xs">
                {showCart ? '▲ hide' : '▼ review'}
              </span>
            </button>
            <button
              type="button"
              disabled={belowMinimum}
              onClick={() => router.push('/kiosk/checkout')}
              className="h-14 rounded-2xl bg-slate-900 px-8 text-lg font-bold text-white active:bg-slate-700 disabled:opacity-40"
            >
              Checkout →
            </button>
          </div>

          {/* Expandable cart review */}
          {showCart && (
            <div className="mt-4 flex flex-col gap-2 border-t pt-4">
              {lines.map((line) => {
                const key = cartLineKey(line);
                return (
                  <div key={key} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{line.name}</p>
                      {line.modifiers.length > 0 ? (
                        <p className="text-muted-foreground text-xs">
                          {line.modifiers.map((m) => m.optionName).join(', ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => decrementLine(key)}
                        className="border-input h-8 w-8 rounded-lg border text-base"
                      >
                        −
                      </button>
                      <span className="w-5 text-center">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => incrementLine(key)}
                        className="border-input h-8 w-8 rounded-lg border text-base"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLine(key)}
                        className="text-muted-foreground ml-1 text-xs underline"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </footer>
      )}

      {/* Modifier configurator modal */}
      {configuring ? (
        <ItemConfigurator
          itemId={configuring.item.id}
          name={configuring.item.name}
          description={configuring.item.description}
          priceMinor={configuring.item.priceMinor}
          currency={currency}
          locale={locale}
          modifiers={configuring.item.modifiers}
          onClose={() => setConfiguring(null)}
          onAdded={handleConfigured}
        />
      ) : null}

      <PinOverlay />
    </div>
  );
}
