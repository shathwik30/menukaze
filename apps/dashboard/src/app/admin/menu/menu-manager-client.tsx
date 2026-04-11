'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createMenuAction,
  createCategoryAction,
  createItemAction,
  updateItemAction,
  deleteMenuAction,
  deleteCategoryAction,
  deleteItemAction,
  toggleItemSoldOutAction,
} from '@/app/actions/menu-admin';

export interface ManagerItem {
  id: string;
  name: string;
  description?: string;
  priceMinor: number;
  priceLabel: string;
  dietaryTags: string[];
  soldOut: boolean;
  imageUrl?: string;
}
export interface ManagerCategory {
  id: string;
  name: string;
  order: number;
  items: ManagerItem[];
}
export interface ManagerMenu {
  id: string;
  name: string;
  order: number;
  categories: ManagerCategory[];
}

interface Props {
  menus: ManagerMenu[];
  currencyLabel: string;
}

/**
 * Single-pane menu editor. All mutations go through the server actions in
 * actions/menu-admin.ts and rely on revalidatePath('/admin/menu') to
 * refresh the tree in place. Inline state is only used for transient form
 * fields (new menu name, new item details).
 */
export function MenuManagerClient({ menus, currencyLabel }: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <>
      <p className="text-muted-foreground text-xs">Currency: {currencyLabel}</p>

      <CreateMenuForm
        onSubmit={(name, order) => run(() => createMenuAction({ name, order }))}
        pending={isPending}
      />

      {menus.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No menus yet. Create one above to add categories and items.
        </p>
      ) : null}

      {menus.map((menu) => (
        <section key={menu.id} className="border-border rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{menu.name}</h2>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (
                  window.confirm(`Delete "${menu.name}" and every category + item underneath it?`)
                ) {
                  run(() => deleteMenuAction(menu.id));
                }
              }}
              className="text-destructive text-xs underline"
            >
              Delete menu
            </button>
          </div>

          <CreateCategoryForm
            menuId={menu.id}
            onSubmit={(name, order) =>
              run(() => createCategoryAction({ menuId: menu.id, name, order }))
            }
            pending={isPending}
          />

          <div className="mt-4 flex flex-col gap-4">
            {menu.categories.map((category) => (
              <CategoryBlock key={category.id} category={category} pending={isPending} run={run} />
            ))}
          </div>
        </section>
      ))}

      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}
    </>
  );
}

function CreateMenuForm({
  onSubmit,
  pending,
}: {
  onSubmit: (name: string, order: number) => void;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit(name.trim(), 0);
        setName('');
      }}
      className="border-border flex items-center gap-2 rounded-lg border border-dashed p-3"
    >
      <input
        type="text"
        placeholder="New menu name (e.g. Dinner)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="bg-primary text-primary-foreground h-9 rounded-md px-3 text-sm font-medium disabled:opacity-50"
      >
        Add menu
      </button>
    </form>
  );
}

function CreateCategoryForm({
  menuId,
  onSubmit,
  pending,
}: {
  menuId: string;
  onSubmit: (name: string, order: number) => void;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit(name.trim(), 0);
        setName('');
      }}
      className="mt-3 flex items-center gap-2"
    >
      <input
        type="text"
        placeholder="New category (e.g. Starters)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border-input bg-background h-8 flex-1 rounded-md border px-2 text-xs"
        data-menu={menuId}
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="border-input h-8 rounded-md border px-2 text-xs disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}

function CategoryBlock({
  category,
  pending,
  run,
}: {
  category: ManagerCategory;
  pending: boolean;
  run: <T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => void;
}) {
  return (
    <div className="border-border rounded-md border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{category.name}</h3>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Delete "${category.name}" and every item underneath?`)) {
              run(() => deleteCategoryAction(category.id));
            }
          }}
          className="text-destructive text-xs underline"
        >
          Delete category
        </button>
      </div>

      <ItemCreateRow categoryId={category.id} pending={pending} run={run} />

      <ul className="divide-border mt-3 divide-y text-sm">
        {category.items.map((item) => (
          <ItemRow key={item.id} item={item} pending={pending} run={run} />
        ))}
      </ul>
    </div>
  );
}

function ItemCreateRow({
  categoryId,
  pending,
  run,
}: {
  categoryId: string;
  pending: boolean;
  run: <T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => void;
}) {
  const [name, setName] = useState('');
  const [priceMajor, setPriceMajor] = useState('');
  const [description, setDescription] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const priceMinor = Math.round(Number.parseFloat(priceMajor) * 100);
        if (!name.trim() || !Number.isFinite(priceMinor)) return;
        run(() =>
          createItemAction({
            categoryId,
            name: name.trim(),
            priceMinor,
            ...(description.trim() ? { description: description.trim() } : {}),
          }),
        );
        setName('');
        setPriceMajor('');
        setDescription('');
      }}
      className="bg-muted mt-3 grid grid-cols-[1fr_auto_auto] gap-2 rounded-md p-2"
    >
      <input
        type="text"
        placeholder="Item name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border-input bg-background h-8 rounded-md border px-2 text-xs"
      />
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder="Price"
        value={priceMajor}
        onChange={(e) => setPriceMajor(e.target.value)}
        className="border-input bg-background h-8 w-24 rounded-md border px-2 text-xs"
      />
      <button
        type="submit"
        disabled={pending || !name.trim() || !priceMajor}
        className="border-input h-8 rounded-md border px-3 text-xs disabled:opacity-50"
      >
        Add item
      </button>
      <input
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="border-input bg-background col-span-3 h-8 rounded-md border px-2 text-xs"
      />
    </form>
  );
}

function ItemRow({
  item,
  pending,
  run,
}: {
  item: ManagerItem;
  pending: boolean;
  run: <T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [priceMajor, setPriceMajor] = useState((item.priceMinor / 100).toFixed(2));
  const [imageUrl, setImageUrl] = useState(item.imageUrl ?? '');

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate font-medium">
            {item.name}
            {item.soldOut ? (
              <span className="text-muted-foreground ml-2 text-xs uppercase">sold out</span>
            ) : null}
          </p>
          {item.description ? (
            <p className="text-muted-foreground truncate text-xs">{item.description}</p>
          ) : null}
        </div>
        <span className="text-foreground shrink-0 font-mono text-xs">{item.priceLabel}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => toggleItemSoldOutAction({ id: item.id, soldOut: !item.soldOut }))
          }
          className="text-xs underline"
        >
          {item.soldOut ? 'Restock' : 'Sold out'}
        </button>
        <button type="button" onClick={() => setEditing(true)} className="text-xs underline">
          Edit
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Delete "${item.name}"?`)) {
              run(() => deleteItemAction(item.id));
            }
          }}
          className="text-destructive text-xs underline"
        >
          Delete
        </button>
      </li>
    );
  }

  return (
    <li className="py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const priceMinor = Math.round(Number.parseFloat(priceMajor) * 100);
          if (!name.trim() || !Number.isFinite(priceMinor)) return;
          run(() =>
            updateItemAction({
              id: item.id,
              name: name.trim(),
              description: description.trim() || undefined,
              priceMinor,
              imageUrl: imageUrl.trim() || undefined,
            }),
          );
          setEditing(false);
        }}
        className="flex flex-col gap-2"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        />
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceMajor}
            onChange={(e) => setPriceMajor(e.target.value)}
            className="border-input bg-background h-8 w-24 rounded-md border px-2 text-xs"
          />
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Image URL (optional)"
            className="border-input bg-background h-8 flex-1 rounded-md border px-2 text-xs"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-primary text-primary-foreground h-8 rounded-md px-3 text-xs disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="border-input h-8 rounded-md border px-3 text-xs"
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}
