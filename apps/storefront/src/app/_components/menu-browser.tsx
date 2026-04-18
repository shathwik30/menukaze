'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Eyebrow, Input, cn } from '@menukaze/ui';
import { AddToCartButton } from './add-to-cart-button';

interface MenuSummary {
  id: string;
  name: string;
}
interface CategorySummary {
  id: string;
  name: string;
  menuId: string;
}
interface ItemSummary {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  priceLabel: string;
  priceMinor: number;
  dietaryTags: string[];
  soldOut: boolean;
  imageUrl?: string;
  comboItemNames: string[];
  modifiers: Array<{
    name: string;
    required: boolean;
    max: number;
    options: Array<{
      name: string;
      priceMinor: number;
      priceLabel: string;
    }>;
  }>;
}

interface Props {
  menus: MenuSummary[];
  categories: CategorySummary[];
  items: ItemSummary[];
  currency: string;
  locale: string;
}

export function MenuBrowser({ menus, categories, items, currency, locale }: Props) {
  const [activeMenuId, setActiveMenuId] = useState<string>(menus[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) for (const tag of item.dietaryTags) set.add(tag);
    return Array.from(set).sort();
  }, [items]);

  const visibleCategories = useMemo(() => {
    const menuId = activeMenuId || menus[0]?.id;
    return categories.filter((c) => c.menuId === menuId);
  }, [categories, activeMenuId, menus]);

  const q = query.trim().toLowerCase();

  return (
    <div className="flex flex-col gap-8">
      {menus.length > 1 || visibleCategories.length > 1 ? (
        <div
          className={cn(
            'sticky top-0 z-20 -mx-4 flex flex-col backdrop-blur-md sm:mx-0',
            'bg-canvas-50/85 dark:bg-ink-950/85 border-ink-100 dark:border-ink-800',
            'border-b',
          )}
        >
          {menus.length > 1 ? (
            <nav aria-label="Menus" className="flex gap-1 overflow-x-auto px-4 sm:px-0">
              {menus.map((menu) => {
                const active = menu.id === activeMenuId;
                return (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => setActiveMenuId(menu.id)}
                    className={cn(
                      'relative -mb-px px-1 py-3.5 text-sm font-medium whitespace-nowrap transition-colors',
                      active
                        ? 'text-ink-950 dark:text-canvas-50'
                        : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-canvas-100',
                    )}
                  >
                    {menu.name}
                    <span
                      aria-hidden
                      className={cn(
                        'bg-ink-950 dark:bg-canvas-50 absolute inset-x-0 -bottom-px h-[2px] transition-transform duration-300',
                        active ? 'scale-x-100' : 'scale-x-0',
                      )}
                    />
                  </button>
                );
              })}
            </nav>
          ) : null}

          {visibleCategories.length > 1 ? <CategoryChipNav categories={visibleCategories} /> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <label className="relative flex-1">
          <span className="sr-only">Search menu</span>
          <SearchIcon className="text-ink-400 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search the menu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </label>
        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={activeTag === null} onClick={() => setActiveTag(null)}>
              All
            </FilterChip>
            {allTags.map((tag) => (
              <FilterChip
                key={tag}
                active={activeTag === tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                <span className="capitalize">{tag}</span>
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-14">
        {(() => {
          const sections = visibleCategories.flatMap((category) => {
            const categoryItems = items.filter((item) => {
              if (item.categoryId !== category.id) return false;
              if (activeTag && !item.dietaryTags.includes(activeTag)) return false;
              if (q && !`${item.name} ${item.description ?? ''}`.toLowerCase().includes(q))
                return false;
              return true;
            });
            return categoryItems.length === 0 ? [] : [{ category, categoryItems }];
          });
          if (sections.length === 0) {
            return (
              <div className="border-ink-200 bg-canvas-50 dark:border-ink-800 dark:bg-ink-900/30 rounded-2xl border border-dashed px-6 py-16 text-center">
                <p className="text-ink-600 dark:text-ink-400 font-serif text-xl">
                  No dishes match your search.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setActiveTag(null);
                  }}
                  className="text-saffron-700 hover:text-saffron-800 mt-3 text-sm font-medium underline underline-offset-4 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            );
          }
          return sections.map(({ category, categoryItems }) => (
            <section
              key={category.id}
              id={`category-${category.id}`}
              aria-labelledby={`category-${category.id}-title`}
              className="scroll-mt-20"
            >
              <div className="border-ink-100 dark:border-ink-900 flex items-end justify-between border-b pb-4">
                <div>
                  <Eyebrow tone="accent">Course</Eyebrow>
                  <h2
                    id={`category-${category.id}-title`}
                    className="text-foreground mt-1.5 font-serif text-3xl font-medium tracking-tight sm:text-4xl"
                  >
                    {category.name}
                  </h2>
                </div>
                <span className="mk-nums text-ink-500 dark:text-ink-400 hidden shrink-0 text-sm sm:block">
                  {categoryItems.length} {categoryItems.length === 1 ? 'dish' : 'dishes'}
                </span>
              </div>
              <ul className="mt-6 grid grid-cols-1 gap-x-10 gap-y-2 md:grid-cols-2">
                {categoryItems.map((item) => (
                  <DishRow key={item.id} item={item} currency={currency} locale={locale} />
                ))}
              </ul>
            </section>
          ));
        })()}
      </div>
    </div>
  );
}

function CategoryChipNav({ categories }: { categories: CategorySummary[] }) {
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? '');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = visible[0].target.id.replace(/^category-/, '');
          setActiveId(id);
        }
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
    );
    for (const category of categories) {
      const el = document.getElementById(`category-${category.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [categories]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeId) return;
    const chip = list.querySelector<HTMLButtonElement>(`[data-category-id="${activeId}"]`);
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeId]);

  function jumpTo(id: string): void {
    const el = document.getElementById(`category-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Categories"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {categories.map((category) => {
        const active = category.id === activeId;
        return (
          <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-category-id={category.id}
            onClick={() => jumpTo(category.id)}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-ink-950 border-ink-950 text-canvas-50 dark:bg-canvas-50 dark:border-canvas-50 dark:text-ink-950'
                : 'border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-950 dark:border-ink-700 dark:text-ink-300 dark:hover:border-ink-600 dark:hover:text-canvas-50 bg-surface',
            )}
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-full px-3.5 text-xs font-medium transition-all duration-200',
        active
          ? 'bg-ink-950 text-canvas-50 ring-ink-950 dark:bg-canvas-50 dark:text-ink-950 dark:ring-canvas-50 shadow-sm ring-1'
          : 'bg-surface text-ink-700 ring-ink-200 hover:bg-canvas-100 hover:text-ink-950 hover:ring-ink-300 dark:bg-ink-900 dark:text-ink-300 dark:ring-ink-800 dark:hover:bg-ink-800 ring-1',
      )}
    >
      {children}
    </button>
  );
}

function DishRow({
  item,
  currency,
  locale,
}: {
  item: ItemSummary;
  currency: string;
  locale: string;
}) {
  return (
    <li
      className={cn(
        'border-ink-100/70 dark:border-ink-800/70 group relative flex items-start gap-4 border-b py-5 transition-opacity last:border-b-0',
        item.soldOut && 'opacity-60',
      )}
    >
      {item.imageUrl ? (
        <div className="ring-ink-100 dark:ring-ink-800 relative size-20 shrink-0 overflow-hidden rounded-xl ring-1">
          <img
            src={item.imageUrl}
            alt=""
            className="size-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-foreground font-serif text-lg leading-tight font-medium tracking-tight">
            {item.name}
          </h3>
          <div
            aria-hidden
            className="border-ink-300 dark:border-ink-700 mt-2.5 hidden h-px flex-1 border-t border-dotted sm:block"
          />
          <span className="mk-nums text-foreground shrink-0 font-serif text-lg font-medium tracking-tight tabular-nums">
            {item.priceLabel}
          </span>
        </div>
        {item.description ? (
          <p className="text-ink-500 dark:text-ink-400 mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed">
            {item.description}
          </p>
        ) : null}
        {item.comboItemNames.length > 0 ? (
          <p className="text-ink-500 dark:text-ink-400 mt-1 text-[12px] italic">
            Includes {item.comboItemNames.join(' · ')}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          {item.dietaryTags.map((t) => (
            <Badge key={t} variant="subtle" size="xs" shape="pill">
              <span className="capitalize">{t}</span>
            </Badge>
          ))}
          {item.soldOut ? (
            <Badge variant="danger" size="xs" shape="pill">
              Sold out
            </Badge>
          ) : null}
          {item.modifiers.length > 0 ? (
            <span className="text-ink-400 dark:text-ink-500 text-[11px]">
              · {item.modifiers.length} option{item.modifiers.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        <div className="mt-3.5">
          <AddToCartButton
            itemId={item.id}
            name={item.name}
            priceMinor={item.priceMinor}
            currency={currency}
            locale={locale}
            modifiers={item.modifiers}
            disabled={item.soldOut}
          />
        </div>
      </div>
    </li>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
