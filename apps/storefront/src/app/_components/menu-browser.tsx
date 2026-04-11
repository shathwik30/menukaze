'use client';

import { useMemo, useState } from 'react';

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
  dietaryTags: string[];
  soldOut: boolean;
}

interface Props {
  menus: MenuSummary[];
  categories: CategorySummary[];
  items: ItemSummary[];
}

/**
 * Client-side menu browser: search bar, dietary-tag filters, and a
 * menu-tab switcher when a restaurant has more than one menu. Rendering
 * lives here instead of the server page so filters don't cost a round trip.
 */
export function MenuBrowser({ menus, categories, items }: Props) {
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
    <div className="flex flex-col gap-6">
      {menus.length > 1 ? (
        <nav aria-label="Menus" className="border-border flex gap-1 overflow-x-auto border-b">
          {menus.map((menu) => {
            const active = menu.id === activeMenuId;
            return (
              <button
                key={menu.id}
                type="button"
                onClick={() => setActiveMenuId(menu.id)}
                className={
                  active
                    ? 'border-foreground text-foreground -mb-px border-b-2 px-3 py-2 text-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground -mb-px border-b-2 border-transparent px-3 py-2 text-sm'
                }
              >
                {menu.name}
              </button>
            );
          })}
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="sr-only">Search menu</span>
          <input
            type="search"
            placeholder="Search menu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={
                activeTag === null
                  ? 'border-foreground bg-foreground text-background rounded-full border px-3 py-1 text-xs'
                  : 'border-input text-muted-foreground hover:text-foreground rounded-full border px-3 py-1 text-xs'
              }
            >
              All
            </button>
            {allTags.map((tag) => {
              const active = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(active ? null : tag)}
                  className={
                    active
                      ? 'border-foreground bg-foreground text-background rounded-full border px-3 py-1 text-xs capitalize'
                      : 'border-input text-muted-foreground hover:text-foreground rounded-full border px-3 py-1 text-xs capitalize'
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-8">
        {visibleCategories.map((category) => {
          const categoryItems = items.filter((item) => {
            if (item.categoryId !== category.id) return false;
            if (activeTag && !item.dietaryTags.includes(activeTag)) return false;
            if (q && !`${item.name} ${item.description ?? ''}`.toLowerCase().includes(q))
              return false;
            return true;
          });
          if (categoryItems.length === 0) return null;
          return (
            <section key={category.id}>
              <h2 className="text-lg font-semibold">{category.name}</h2>
              <ul className="divide-border mt-3 divide-y">
                {categoryItems.map((item) => (
                  <li
                    key={item.id}
                    className={
                      item.soldOut
                        ? 'flex items-start justify-between gap-4 py-3 opacity-50'
                        : 'flex items-start justify-between gap-4 py-3'
                    }
                  >
                    <div className="min-w-0">
                      <p className="text-foreground font-medium">
                        {item.name}
                        {item.soldOut ? (
                          <span className="text-muted-foreground ml-2 text-xs uppercase">
                            sold out
                          </span>
                        ) : null}
                      </p>
                      {item.description ? (
                        <p className="text-muted-foreground mt-1 text-sm">{item.description}</p>
                      ) : null}
                      {item.dietaryTags.length > 0 ? (
                        <p className="text-muted-foreground mt-1 flex flex-wrap gap-1 text-[10px] uppercase">
                          {item.dietaryTags.map((t) => (
                            <span key={t} className="border-border rounded-sm border px-1.5 py-0.5">
                              {t}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-foreground shrink-0 font-mono text-sm">
                      {item.priceLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
