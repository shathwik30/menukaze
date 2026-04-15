'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeTax, type TaxRule } from '@menukaze/shared';
import { cartItemCount, cartLineKey, cartSubtotalMinor, useKioskCart } from '@/stores/cart';
import { useIdleReset } from '@/hooks/use-idle-reset';
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
  restaurantName,
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
  const { surchargeMinor, taxMinor } = useMemo(
    () => computeTax(subtotal, taxRules),
    [subtotal, taxRules],
  );
  const total = subtotal + surchargeMinor;
  const itemCount = cartItemCount(lines);
  const belowMinimum = minimumOrderMinor > 0 && subtotal > 0 && subtotal < minimumOrderMinor;
  const activeCategoryName = visibleCategories.find((c) => c.id === activeCategoryId)?.name;

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
    <div className="grid h-screen grid-rows-[88px_minmax(0,1fr)] bg-zinc-50 text-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6">
        <button
          type="button"
          onClick={() => router.push('/kiosk/mode')}
          className="h-14 rounded-lg border border-zinc-300 px-5 text-lg font-bold text-zinc-700 active:bg-zinc-100"
        >
          Back
        </button>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-emerald-700">
            Step 2 of 3
          </p>
          <h1 className="text-2xl font-black">{restaurantName}</h1>
        </div>
        <div className="rounded-lg bg-zinc-950 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white">
          {orderMode === 'dine_in' ? 'Dine in' : 'Takeaway'}
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[228px_minmax(0,1fr)_360px]">
        <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Menu</p>
            <p className="mt-1 text-lg font-black">Pick a category</p>
          </div>

          {menus.length > 1 ? (
            <div className="border-b border-zinc-200 p-3">
              <div className="flex flex-col gap-2">
                {menus.map((menu) => (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => setActiveMenuId(menu.id)}
                    className={`min-h-12 rounded-lg px-3 text-left text-sm font-bold ${
                      menu.id === activeMenuId
                        ? 'bg-zinc-950 text-white'
                        : 'bg-zinc-100 text-zinc-700 active:bg-zinc-200'
                    }`}
                  >
                    {menu.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`min-h-16 rounded-lg px-4 text-left text-base font-bold ${
                  cat.id === activeCategoryId
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'bg-zinc-100 text-zinc-700 active:bg-zinc-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-zinc-500">
                {activeCategoryName ?? 'Items'}
              </p>
              <h2 className="mt-1 text-4xl font-black tracking-tight">
                {visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''}
              </h2>
            </div>
            <p className="max-w-sm text-right text-sm font-medium text-zinc-500">
              Tap an item to add it. Items with choices open a quick customize screen.
            </p>
          </div>

          {visibleItems.length === 0 ? (
            <div className="flex h-[60vh] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white">
              <p className="text-center text-xl font-bold text-zinc-500">
                No items in this category right now.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {visibleItems.map((item) => {
                const inCart = lines.reduce(
                  (sum, l) => (l.itemId === item.id ? sum + l.quantity : sum),
                  0,
                );
                const isJustAdded = justAddedId === item.id;
                return (
                  <article
                    key={item.id}
                    className={`flex min-h-[390px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm ${
                      item.soldOut ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-zinc-100">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="rounded-lg bg-zinc-950 px-4 py-3 text-2xl font-black text-white">
                            MK
                          </span>
                        </div>
                      )}
                      {inCart > 0 ? (
                        <span className="absolute right-3 top-3 rounded-md bg-emerald-500 px-3 py-1 text-sm font-black text-zinc-950">
                          {inCart} in order
                        </span>
                      ) : null}
                      {item.soldOut ? (
                        <span className="absolute inset-x-3 bottom-3 rounded-md bg-white px-3 py-2 text-center text-sm font-black uppercase tracking-[0.16em] text-rose-700">
                          Sold out
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-xl font-black leading-tight">{item.name}</h3>
                        <p className="shrink-0 font-mono text-base font-black">{item.priceLabel}</p>
                      </div>

                      {item.description ? (
                        <p className="mt-2 line-clamp-2 text-sm leading-snug text-zinc-600">
                          {item.description}
                        </p>
                      ) : null}
                      {item.comboItemNames.length > 0 ? (
                        <p className="mt-2 line-clamp-2 text-xs font-medium text-zinc-500">
                          Includes {item.comboItemNames.join(', ')}
                        </p>
                      ) : null}

                      <div className="mt-auto pt-4">
                        {item.soldOut ? (
                          <span className="flex h-14 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-base font-black text-rose-700">
                            Unavailable
                          </span>
                        ) : item.modifiers.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenConfigurator(item)}
                            className={`h-14 w-full rounded-lg text-lg font-black ${
                              isJustAdded
                                ? 'bg-emerald-500 text-zinc-950'
                                : 'bg-zinc-950 text-white active:bg-emerald-600'
                            }`}
                          >
                            {isJustAdded
                              ? 'Added'
                              : inCart > 0
                                ? `Add more (${inCart})`
                                : 'Customize'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddSimple(item)}
                            className={`h-14 w-full rounded-lg text-lg font-black ${
                              isJustAdded
                                ? 'bg-emerald-500 text-zinc-950'
                                : 'bg-zinc-950 text-white active:bg-emerald-600'
                            }`}
                          >
                            {isJustAdded ? 'Added' : inCart > 0 ? `Add more (${inCart})` : 'Add'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        <aside className="flex min-h-0 flex-col border-l border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">
              Current order
            </p>
            <div className="mt-2 flex items-end justify-between">
              <h2 className="text-3xl font-black">{itemCount}</h2>
              <p className="pb-1 text-sm font-bold text-zinc-500">
                item{itemCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
                <p className="text-2xl font-black">Your order is empty</p>
                <p className="mt-2 text-base text-zinc-500">Add an item to review and pay.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {lines.map((line) => {
                  const key = cartLineKey(line);
                  const unitMinor =
                    line.priceMinor + line.modifiers.reduce((s, m) => s + m.priceMinor, 0);
                  return (
                    <div key={key} className="border-b border-zinc-200 pb-4 last:border-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-black leading-tight">{line.name}</p>
                          {line.modifiers.length > 0 ? (
                            <p className="mt-1 line-clamp-2 text-xs font-medium text-zinc-500">
                              {line.modifiers.map((m) => m.optionName).join(', ')}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 font-mono text-sm font-black">
                          {fmt(unitMinor * line.quantity)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => decrementLine(key)}
                            className="h-11 w-11 rounded-lg border border-zinc-300 text-xl font-black active:bg-zinc-100"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-lg font-black">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => incrementLine(key)}
                            className="h-11 w-11 rounded-lg border border-zinc-300 text-xl font-black active:bg-zinc-100"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(key)}
                          className="h-11 rounded-lg px-3 text-sm font-bold text-rose-700 active:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-zinc-200 p-5">
            {belowMinimum ? (
              <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900">
                Minimum order is {fmt(minimumOrderMinor)}. Add more items to continue.
              </p>
            ) : null}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Subtotal</span>
                <span className="font-mono">{fmt(subtotal)}</span>
              </div>
              {taxMinor > 0 ? (
                <div className="flex justify-between text-zinc-600">
                  <span>Tax</span>
                  <span className="font-mono">{fmt(taxMinor)}</span>
                </div>
              ) : null}
              <div className="flex items-end justify-between pt-2 text-2xl font-black">
                <span>Total</span>
                <span className="font-mono">{fmt(total)}</span>
              </div>
            </div>
            <button
              type="button"
              disabled={itemCount === 0 || belowMinimum}
              onClick={() => router.push('/kiosk/checkout')}
              className="mt-5 h-16 w-full rounded-lg bg-emerald-500 text-xl font-black text-zinc-950 active:bg-emerald-400 disabled:bg-zinc-200 disabled:text-zinc-500"
            >
              Review and pay
            </button>
          </div>
        </aside>
      </div>

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
    </div>
  );
}
