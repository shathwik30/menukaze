'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeTax, type TaxRule } from '@menukaze/shared';
import { Badge, Button, Eyebrow, cn } from '@menukaze/ui';
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

  useEffect(() => {
    setRestaurant(restaurantId, currency, locale);
  }, [restaurantId, currency, locale, setRestaurant]);

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
    <div className="bg-canvas-50 text-ink-950 grid h-screen grid-rows-[96px_minmax(0,1fr)]">
      <header className="border-ink-100 bg-surface flex items-center justify-between border-b px-8">
        <Button
          type="button"
          onClick={() => router.push('/kiosk/mode')}
          variant="outline"
          size="2xl"
          className="text-ink-700 active:bg-canvas-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </Button>
        <div className="text-center">
          <Eyebrow tone="accent">Step 2 of 3 · {restaurantName}</Eyebrow>
          <p className="mt-1 font-serif text-2xl font-medium tracking-tight">Choose your dishes</p>
        </div>
        <Badge
          variant="solid"
          size="lg"
          shape="pill"
          className="px-5 py-2 text-sm tracking-[0.18em] uppercase"
        >
          {orderMode === 'dine_in' ? 'Dine in' : 'Takeaway'}
        </Badge>
      </header>

      <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_380px]">
        {/* Categories sidebar */}
        <aside className="border-ink-100 bg-surface flex min-h-0 flex-col border-r">
          <div className="border-ink-100 border-b p-5">
            <Eyebrow tone="accent">Menu</Eyebrow>
            <p className="text-ink-950 mt-2 font-serif text-xl font-medium tracking-tight">
              Pick a category
            </p>
          </div>

          {menus.length > 1 ? (
            <div className="border-ink-100 border-b p-3">
              <div className="flex flex-col gap-1.5">
                {menus.map((menu) => {
                  const active = menu.id === activeMenuId;
                  return (
                    <Button
                      key={menu.id}
                      type="button"
                      onClick={() => setActiveMenuId(menu.id)}
                      variant="plain"
                      size="none"
                      className={cn(
                        'min-h-11 rounded-xl px-4 text-left text-sm font-medium transition-colors',
                        active
                          ? 'bg-ink-950 text-canvas-50'
                          : 'bg-canvas-100 text-ink-700 active:bg-canvas-200',
                      )}
                    >
                      {menu.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
            {visibleCategories.map((cat) => {
              const active = cat.id === activeCategoryId;
              const count = items.filter((i) => i.categoryId === cat.id && !i.soldOut).length;
              return (
                <Button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryId(cat.id)}
                  variant="plain"
                  size="none"
                  className={cn(
                    'group flex min-h-16 items-center justify-between rounded-2xl px-4 text-left transition-all duration-200 active:scale-[0.99]',
                    active
                      ? 'bg-saffron-500 text-ink-950 shadow-[0_8px_24px_-8px_oklch(0.615_0.180_44/0.5)]'
                      : 'bg-canvas-100 text-ink-800 hover:bg-canvas-200',
                  )}
                >
                  <span className="font-serif text-lg font-medium tracking-tight">{cat.name}</span>
                  <span
                    className={cn(
                      'mk-nums rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums transition-colors',
                      active ? 'bg-ink-950/10 text-ink-950' : 'bg-surface text-ink-500',
                    )}
                  >
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>
        </aside>

        {/* Items grid */}
        <main className="min-h-0 overflow-y-auto p-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <Eyebrow tone="accent">{activeCategoryName ?? 'Items'}</Eyebrow>
              <h2 className="text-ink-950 mt-2 font-serif text-5xl font-medium tracking-tight">
                {visibleItems.length} {visibleItems.length === 1 ? 'dish' : 'dishes'}
              </h2>
            </div>
            <p className="text-ink-500 max-w-sm text-right text-sm">
              Tap an item to add it. Dishes with choices open a quick customise screen.
            </p>
          </div>

          {visibleItems.length === 0 ? (
            <div className="border-ink-200 bg-surface flex h-[60vh] items-center justify-center rounded-3xl border border-dashed">
              <p className="text-ink-500 text-center font-serif text-2xl font-medium">
                No items in this category right now.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
              {visibleItems.map((item) => {
                const inCart = lines.reduce(
                  (sum, l) => (l.itemId === item.id ? sum + l.quantity : sum),
                  0,
                );
                const isJustAdded = justAddedId === item.id;
                return (
                  <article
                    key={item.id}
                    className={cn(
                      'border-ink-100 bg-surface group flex min-h-[400px] flex-col overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl',
                      item.soldOut && 'opacity-60',
                    )}
                  >
                    <div className="bg-canvas-100 relative aspect-[4/3] overflow-hidden">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="from-canvas-100 to-canvas-300 flex h-full w-full items-center justify-center bg-gradient-to-br">
                          <span className="text-ink-300 font-serif text-5xl font-medium">
                            {item.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      {inCart > 0 && !item.soldOut ? (
                        <span className="bg-saffron-500 absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
                          <span className="mk-nums font-mono tabular-nums">{inCart}</span> in order
                        </span>
                      ) : null}
                      {item.soldOut ? (
                        <span className="bg-surface/95 text-mkrose-700 absolute inset-x-4 bottom-4 rounded-xl px-3 py-2 text-center text-sm font-semibold tracking-[0.16em] uppercase shadow-md backdrop-blur">
                          Sold out
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-ink-950 font-serif text-xl leading-tight font-medium tracking-tight">
                          {item.name}
                        </h3>
                        <p className="mk-nums text-ink-950 shrink-0 font-mono text-base font-semibold tabular-nums">
                          {item.priceLabel}
                        </p>
                      </div>

                      {item.description ? (
                        <p className="text-ink-500 mt-2 line-clamp-2 text-[13px] leading-relaxed">
                          {item.description}
                        </p>
                      ) : null}
                      {item.comboItemNames.length > 0 ? (
                        <p className="text-ink-500 mt-2 line-clamp-2 text-[11px] italic">
                          Includes {item.comboItemNames.join(' · ')}
                        </p>
                      ) : null}

                      <div className="mt-auto pt-4">
                        {item.soldOut ? (
                          <span className="border-mkrose-200 bg-mkrose-50 text-mkrose-700 flex h-14 items-center justify-center rounded-xl border text-sm font-semibold tracking-[0.14em] uppercase">
                            Unavailable
                          </span>
                        ) : item.modifiers.length > 0 ? (
                          <Button
                            type="button"
                            onClick={() => handleOpenConfigurator(item)}
                            variant="plain"
                            size="none"
                            className={cn(
                              'h-14 w-full rounded-xl font-medium tracking-tight transition-all duration-200 active:scale-[0.98]',
                              isJustAdded
                                ? 'bg-jade-500 text-white'
                                : 'bg-ink-950 text-canvas-50 hover:bg-ink-900',
                            )}
                          >
                            {isJustAdded ? (
                              <span className="inline-flex items-center gap-2 font-serif text-lg">
                                <CheckIcon /> Added
                              </span>
                            ) : inCart > 0 ? (
                              <span className="font-serif text-lg">Add more</span>
                            ) : (
                              <span className="font-serif text-lg">Customise</span>
                            )}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => handleAddSimple(item)}
                            variant="plain"
                            size="none"
                            className={cn(
                              'h-14 w-full rounded-xl font-medium tracking-tight transition-all duration-200 active:scale-[0.98]',
                              isJustAdded
                                ? 'bg-jade-500 text-white'
                                : 'bg-saffron-500 hover:bg-saffron-600 text-white shadow-[0_6px_16px_-4px_oklch(0.615_0.180_44/0.4)]',
                            )}
                          >
                            {isJustAdded ? (
                              <span className="inline-flex items-center gap-2 font-serif text-lg">
                                <CheckIcon /> Added
                              </span>
                            ) : inCart > 0 ? (
                              <span className="font-serif text-lg">Add another</span>
                            ) : (
                              <span className="inline-flex items-center gap-2 font-serif text-lg">
                                <PlusIcon /> Add to order
                              </span>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* Cart sidebar */}
        <aside className="border-ink-100 bg-surface flex min-h-0 flex-col border-l">
          <div className="border-ink-100 border-b p-5">
            <Eyebrow tone="accent">Current order</Eyebrow>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-ink-950 font-serif text-5xl leading-none font-medium tracking-tight">
                {itemCount}
              </p>
              <p className="text-ink-500 pb-1.5 text-sm font-medium">
                item{itemCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {lines.length === 0 ? (
              <div className="border-ink-200 bg-canvas-50/50 flex h-full flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
                <div className="bg-canvas-100 text-ink-400 mb-4 flex size-14 items-center justify-center rounded-2xl">
                  <CartIcon />
                </div>
                <p className="text-ink-600 font-serif text-xl font-medium">Your order is empty</p>
                <p className="text-ink-500 mt-2 text-sm">Add a dish to review and pay.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {lines.map((line) => {
                  const key = cartLineKey(line);
                  const unitMinor =
                    line.priceMinor + line.modifiers.reduce((s, m) => s + m.priceMinor, 0);
                  return (
                    <div
                      key={key}
                      className="border-ink-100 bg-canvas-50/70 rounded-2xl border p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-ink-950 font-serif text-[15px] leading-tight font-medium">
                            {line.name}
                          </p>
                          {line.modifiers.length > 0 ? (
                            <p className="text-ink-500 mt-1 line-clamp-2 text-[11px]">
                              {line.modifiers.map((m) => m.optionName).join(' · ')}
                            </p>
                          ) : null}
                        </div>
                        <span className="mk-nums text-ink-950 shrink-0 font-mono text-sm font-semibold tabular-nums">
                          {fmt(unitMinor * line.quantity)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="border-ink-200 bg-surface inline-flex items-center gap-1 rounded-full border p-1">
                          <Button
                            type="button"
                            onClick={() => decrementLine(key)}
                            variant="plain"
                            size="none"
                            className="text-ink-700 active:bg-canvas-100 flex size-10 items-center justify-center rounded-full font-mono text-xl transition-colors"
                            aria-label="Decrease"
                          >
                            −
                          </Button>
                          <span className="mk-nums w-8 text-center font-mono text-base font-semibold tabular-nums">
                            {line.quantity}
                          </span>
                          <Button
                            type="button"
                            onClick={() => incrementLine(key)}
                            variant="plain"
                            size="none"
                            className="text-ink-700 active:bg-canvas-100 flex size-10 items-center justify-center rounded-full font-mono text-xl transition-colors"
                            aria-label="Increase"
                          >
                            +
                          </Button>
                        </div>
                        <Button
                          type="button"
                          onClick={() => removeLine(key)}
                          variant="ghost"
                          size="sm"
                          className="text-mkrose-700 active:bg-mkrose-50"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-ink-100 border-t p-5">
            {belowMinimum ? (
              <div className="border-saffron-200 bg-saffron-50 text-saffron-900 mb-3 rounded-xl border px-3 py-2.5 text-[13px] font-medium">
                Minimum order is{' '}
                <span className="mk-nums font-mono font-semibold tabular-nums">
                  {fmt(minimumOrderMinor)}
                </span>
                . Add more to continue.
              </div>
            ) : null}
            <div className="space-y-1.5 text-sm">
              <div className="text-ink-600 flex justify-between">
                <span>Subtotal</span>
                <span className="mk-nums font-mono tabular-nums">{fmt(subtotal)}</span>
              </div>
              {taxMinor > 0 ? (
                <div className="text-ink-600 flex justify-between">
                  <span>Tax</span>
                  <span className="mk-nums font-mono tabular-nums">{fmt(taxMinor)}</span>
                </div>
              ) : null}
              <div className="border-ink-200 flex items-end justify-between border-t pt-3 text-lg font-medium">
                <span className="font-serif">Total</span>
                <span className="mk-nums font-serif text-3xl font-medium tracking-tight tabular-nums">
                  {fmt(total)}
                </span>
              </div>
            </div>
            <Button
              type="button"
              disabled={itemCount === 0 || belowMinimum}
              onClick={() => router.push('/kiosk/checkout')}
              variant="plain"
              size="none"
              className={cn(
                'mt-5 flex h-16 w-full items-center justify-center gap-3 rounded-2xl font-serif text-xl font-medium tracking-tight transition-all duration-200 active:scale-[0.99]',
                itemCount === 0 || belowMinimum
                  ? 'bg-canvas-200 text-ink-400'
                  : 'bg-ink-950 text-canvas-50 hover:bg-ink-900 shadow-[0_16px_40px_-12px_oklch(0.14_0.016_90/0.45)]',
              )}
            >
              Review &amp; pay
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-6"
                aria-hidden
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Button>
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

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
      aria-hidden
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}
