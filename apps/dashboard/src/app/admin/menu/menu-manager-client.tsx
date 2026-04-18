'use client';

import { useEffect, useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  createMenuAction,
  createCategoryAction,
  createItemAction,
  updateMenuAction,
  updateCategoryAction,
  updateItemAction,
  deleteMenuAction,
  deleteCategoryAction,
  deleteItemAction,
  toggleItemSoldOutAction,
} from '@/app/actions/menu-admin';

export interface ManagerModifierOption {
  name: string;
  priceMinor: number;
}

export interface ManagerModifierGroup {
  name: string;
  required: boolean;
  max: number;
  options: ManagerModifierOption[];
}

const modifierOptionSchema = z.object({
  name: z.string().min(1).max(120),
  priceMinor: z.number().int().min(0),
});

const modifierGroupSchema = z.object({
  name: z.string().min(1).max(120),
  required: z.boolean(),
  max: z.number().int().min(0),
  options: z.array(modifierOptionSchema).max(20),
});

export interface ManagerItem {
  id: string;
  name: string;
  description?: string;
  priceMinor: number;
  priceLabel: string;
  dietaryTags: string[];
  soldOut: boolean;
  imageUrl?: string;
  modifiers: ManagerModifierGroup[];
  comboOf: string[];
  comboItemNames: string[];
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
  schedule?: {
    days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
    startTime: string;
    endTime: string;
  };
  categories: ManagerCategory[];
}

export interface ManagerItemChoice {
  id: string;
  name: string;
  categoryName: string;
}

interface Props {
  menus: ManagerMenu[];
  currencyLabel: string;
  availableItems: ManagerItemChoice[];
  canEdit: boolean;
  canToggleAvailability: boolean;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const DAY_LABELS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
] as const;

type ActionRunner = <T>(
  fn: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>,
) => void;

function parseDietaryTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function formatModifiers(modifiers: ManagerModifierGroup[]): string {
  if (modifiers.length === 0) return '[]';
  return JSON.stringify(modifiers, null, 2);
}

function parseModifiers(value: string): ManagerModifierGroup[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(trimmed);
  return z.array(modifierGroupSchema).parse(parsed);
}

function toggleComboId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to read image.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function handleImageUpload(
  event: ChangeEvent<HTMLInputElement>,
  onLoaded: (value: string) => void,
  onError: (message: string) => void,
) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    onError('Use a JPG, PNG, or WebP image.');
    event.target.value = '';
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    onError('Images must be 2 MB or smaller.');
    event.target.value = '';
    return;
  }
  try {
    onLoaded(await readFileAsDataUrl(file));
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Failed to load image.');
  } finally {
    event.target.value = '';
  }
}

export function MenuManagerClient({
  menus,
  currencyLabel,
  availableItems,
  canEdit,
  canToggleAvailability,
}: Props) {
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
    <div className="flex flex-col gap-6">
      <div className="bg-canvas-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300 flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-[11px] font-medium">
        <span className="mk-nums text-ink-400 font-mono text-[10px] tracking-[0.14em] uppercase">
          Currency
        </span>
        <span className="font-mono">{currencyLabel}</span>
      </div>

      {canEdit ? (
        <CreateMenuForm
          onSubmit={(name, order) => run(() => createMenuAction({ name, order }))}
          pending={isPending}
        />
      ) : null}

      {menus.length === 0 ? (
        <div className="border-ink-200 bg-canvas-50 dark:border-ink-800 dark:bg-ink-900/40 rounded-2xl border border-dashed px-6 py-16 text-center">
          <p className="text-ink-600 dark:text-ink-300 font-serif text-xl font-medium">
            No menus yet
          </p>
          <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
            Create one above to add categories and dishes.
          </p>
        </div>
      ) : null}

      {menus.map((menu) => (
        <section
          key={menu.id}
          className="border-ink-100 bg-surface dark:border-ink-800 dark:bg-ink-900 overflow-hidden rounded-2xl border shadow-sm"
        >
          <header className="border-ink-100 bg-canvas-50/70 dark:border-ink-800 dark:bg-ink-900/60 flex items-start justify-between gap-3 border-b px-6 py-4">
            <div className="min-w-0">
              <h2 className="text-foreground font-serif text-2xl font-medium tracking-tight">
                {menu.name}
              </h2>
              <p className="text-ink-500 dark:text-ink-400 mt-1 inline-flex items-center gap-1.5 text-xs">
                {menu.schedule ? (
                  <>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {menu.schedule.days.map((d) => d.toUpperCase()).join(' · ')}
                    <span className="font-mono">
                      {menu.schedule.startTime}–{menu.schedule.endTime}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="bg-jade-500 relative inline-flex size-1.5 rounded-full">
                      <span className="bg-jade-500 absolute inset-0 animate-ping rounded-full opacity-60" />
                    </span>
                    Always active
                  </>
                )}
              </p>
            </div>
            {canEdit ? (
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
                className="text-mkrose-600 dark:text-mkrose-400 text-xs font-medium underline-offset-4 hover:underline"
              >
                Delete menu
              </button>
            ) : null}
          </header>

          <div className="space-y-4 p-6">
            {canEdit ? <MenuSettingsForm menu={menu} pending={isPending} run={run} /> : null}

            {canEdit ? (
              <CreateCategoryForm
                menuId={menu.id}
                onSubmit={(name, order) =>
                  run(() => createCategoryAction({ menuId: menu.id, name, order }))
                }
                pending={isPending}
              />
            ) : null}

            <div className="flex flex-col gap-4">
              {menu.categories.map((category) => (
                <CategoryBlock
                  key={category.id}
                  category={category}
                  availableItems={availableItems}
                  pending={isPending}
                  run={run}
                  canEdit={canEdit}
                  canToggleAvailability={canToggleAvailability}
                />
              ))}
            </div>
          </div>
        </section>
      ))}

      {error ? (
        <div
          role="alert"
          className="border-mkrose-200 bg-mkrose-50 text-mkrose-700 dark:border-mkrose-500/30 dark:bg-mkrose-500/10 dark:text-mkrose-300 rounded-xl border px-4 py-3 text-sm font-medium"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function MenuSettingsForm({
  menu,
  pending,
  run,
}: {
  menu: ManagerMenu;
  pending: boolean;
  run: ActionRunner;
}) {
  const [name, setName] = useState(menu.name);
  const [order, setOrder] = useState(String(menu.order));
  const [scheduled, setScheduled] = useState(Boolean(menu.schedule));
  const [days, setDays] = useState<Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>>(
    menu.schedule?.days ?? [],
  );
  const [startTime, setStartTime] = useState(menu.schedule?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(menu.schedule?.endTime ?? '22:00');

  // Re-sync local form state when the RSC sends fresh props after router.refresh().
  useEffect(() => {
    setName(menu.name);
    setOrder(String(menu.order));
    setScheduled(Boolean(menu.schedule));
    setDays(menu.schedule?.days ?? []);
    setStartTime(menu.schedule?.startTime ?? '09:00');
    setEndTime(menu.schedule?.endTime ?? '22:00');
  }, [menu]);

  function toggleDay(day: (typeof DAY_LABELS)[number][0]) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day],
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          updateMenuAction({
            id: menu.id,
            name: name.trim(),
            order: Number.parseInt(order, 10) || 0,
            schedule: scheduled && days.length > 0 ? { days, startTime, endTime } : null,
          }),
        );
      }}
      className="bg-muted mt-3 flex flex-col gap-3 rounded-md p-3"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        />
        <input
          type="number"
          min="0"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className="border-input bg-background h-8 w-24 rounded-md border px-2 text-xs"
        />
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={scheduled}
          onChange={(e) => setScheduled(e.target.checked)}
        />
        Restrict this menu to scheduled hours
      </label>

      {scheduled ? (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            {DAY_LABELS.map(([day, label]) => (
              <label key={day} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={days.includes(day)}
                  onChange={() => toggleDay(day)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            />
          </div>
        </>
      ) : null}

      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="border-input h-8 self-start rounded-md border px-3 text-xs disabled:opacity-50"
      >
        Save menu settings
      </button>
    </form>
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
  availableItems,
  pending,
  run,
  canEdit,
  canToggleAvailability,
}: {
  category: ManagerCategory;
  availableItems: ManagerItemChoice[];
  pending: boolean;
  run: ActionRunner;
  canEdit: boolean;
  canToggleAvailability: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [order, setOrder] = useState(String(category.order));

  return (
    <div className="border-border rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                updateCategoryAction({
                  id: category.id,
                  name: name.trim(),
                  order: Number.parseInt(order, 10) || 0,
                }),
              );
              setEditing(false);
            }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-input bg-background h-8 flex-1 rounded-md border px-2 text-xs"
            />
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="border-input bg-background h-8 w-20 rounded-md border px-2 text-xs"
            />
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="border-input h-8 rounded-md border px-2 text-xs disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(category.name);
                setOrder(String(category.order));
              }}
              className="text-xs underline"
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold">{category.name}</h3>
              <p className="text-muted-foreground text-[11px]">Order {category.order}</p>
            </div>
            {canEdit ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs underline"
                >
                  Edit
                </button>
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
            ) : null}
          </>
        )}
      </div>

      {canEdit ? (
        <ItemCreateRow
          categoryId={category.id}
          availableItems={availableItems}
          pending={pending}
          run={run}
        />
      ) : null}

      <ul className="divide-border mt-3 divide-y text-sm">
        {category.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            availableItems={availableItems}
            pending={pending}
            run={run}
            canEdit={canEdit}
            canToggleAvailability={canToggleAvailability}
          />
        ))}
      </ul>
    </div>
  );
}

function ItemCreateRow({
  categoryId,
  availableItems,
  pending,
  run,
}: {
  categoryId: string;
  availableItems: ManagerItemChoice[];
  pending: boolean;
  run: ActionRunner;
}) {
  const [name, setName] = useState('');
  const [priceMajor, setPriceMajor] = useState('');
  const [description, setDescription] = useState('');
  const [dietaryTags, setDietaryTags] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [modifierJson, setModifierJson] = useState('[]');
  const [comboOf, setComboOf] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const priceMinor = Math.round(Number.parseFloat(priceMajor) * 100);
        if (!name.trim() || !Number.isFinite(priceMinor)) return;
        try {
          const modifiers = parseModifiers(modifierJson);
          setLocalError(null);
          run(() =>
            createItemAction({
              categoryId,
              name: name.trim(),
              priceMinor,
              ...(description.trim() ? { description: description.trim() } : {}),
              ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
              dietaryTags: parseDietaryTags(dietaryTags),
              modifiers,
              comboOf,
            }),
          );
          setName('');
          setPriceMajor('');
          setDescription('');
          setDietaryTags('');
          setImageUrl('');
          setModifierJson('[]');
          setComboOf([]);
        } catch (error) {
          setLocalError(error instanceof Error ? error.message : 'Invalid modifiers JSON.');
        }
      }}
      className="bg-muted mt-3 flex flex-col gap-2 rounded-md p-2"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
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
      </div>
      <input
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="border-input bg-background h-8 rounded-md border px-2 text-xs"
      />
      <details className="rounded-md border border-dashed border-zinc-300 bg-white/50 p-3">
        <summary className="cursor-pointer text-xs font-medium">Advanced item settings</summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs">
            Dietary tags (comma-separated)
            <input
              type="text"
              value={dietaryTags}
              onChange={(e) => setDietaryTags(e.target.value)}
              placeholder="veg, spicy, gluten-free"
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Upload image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) =>
                void handleImageUpload(
                  event,
                  (value) => {
                    setLocalError(null);
                    setImageUrl(value);
                  },
                  setLocalError,
                )
              }
              className="text-xs"
            />
          </label>
          {imageUrl ? (
            <div className="flex items-center gap-3">
              <img src={imageUrl} alt="" className="h-16 w-16 rounded-md border object-cover" />
              <button type="button" onClick={() => setImageUrl('')} className="text-xs underline">
                Remove image
              </button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 text-xs">
            <p className="font-medium">Combo contents</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableItems.map((choice) => (
                <label key={choice.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={comboOf.includes(choice.id)}
                    onChange={() => setComboOf((prev) => toggleComboId(prev, choice.id))}
                  />
                  <span>
                    {choice.name}
                    <span className="text-muted-foreground"> · {choice.categoryName}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            Modifiers JSON
            <textarea
              value={modifierJson}
              onChange={(e) => setModifierJson(e.target.value)}
              rows={6}
              className="border-input bg-background rounded-md border px-2 py-2 font-mono text-[11px]"
            />
          </label>
        </div>
      </details>
      {localError ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs">
          {localError}
        </p>
      ) : null}
    </form>
  );
}

function ItemRow({
  item,
  availableItems,
  pending,
  run,
  canEdit,
  canToggleAvailability,
}: {
  item: ManagerItem;
  availableItems: ManagerItemChoice[];
  pending: boolean;
  run: ActionRunner;
  canEdit: boolean;
  canToggleAvailability: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [priceMajor, setPriceMajor] = useState((item.priceMinor / 100).toFixed(2));
  const [dietaryTags, setDietaryTags] = useState(item.dietaryTags.join(', '));
  const [imageUrl, setImageUrl] = useState(item.imageUrl ?? '');
  const [modifierJson, setModifierJson] = useState(formatModifiers(item.modifiers));
  const [comboOf, setComboOf] = useState(item.comboOf);
  const [localError, setLocalError] = useState<string | null>(null);

  const comboChoices = availableItems.filter((choice) => choice.id !== item.id);

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-md border object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-foreground truncate font-medium">
                {item.name}
                {item.soldOut ? (
                  <span className="text-muted-foreground ml-2 text-xs uppercase">sold out</span>
                ) : null}
              </p>
              {item.description ? (
                <p className="text-muted-foreground truncate text-xs">{item.description}</p>
              ) : null}
              {item.comboItemNames.length > 0 ? (
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Combo: {item.comboItemNames.join(', ')}
                </p>
              ) : null}
              {item.dietaryTags.length > 0 ? (
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Tags: {item.dietaryTags.join(', ')}
                </p>
              ) : null}
              {item.modifiers.length > 0 ? (
                <p className="text-muted-foreground mt-1 text-[11px]">
                  {item.modifiers.length} modifier group{item.modifiers.length === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <span className="text-foreground shrink-0 font-mono text-xs">{item.priceLabel}</span>
        {canToggleAvailability ? (
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
        ) : null}
        {canEdit ? (
          <>
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
          </>
        ) : null}
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
          try {
            const modifiers = parseModifiers(modifierJson);
            setLocalError(null);
            run(() =>
              updateItemAction({
                id: item.id,
                name: name.trim(),
                description: description.trim() || undefined,
                priceMinor,
                imageUrl: imageUrl.trim() ? imageUrl.trim() : item.imageUrl ? null : undefined,
                dietaryTags: parseDietaryTags(dietaryTags),
                modifiers,
                comboOf,
              }),
            );
            setEditing(false);
          } catch (error) {
            setLocalError(error instanceof Error ? error.message : 'Invalid modifiers JSON.');
          }
        }}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          />
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceMajor}
            onChange={(e) => setPriceMajor(e.target.value)}
            className="border-input bg-background h-8 w-24 rounded-md border px-2 text-xs"
          />
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        />
        <input
          type="text"
          value={dietaryTags}
          onChange={(e) => setDietaryTags(e.target.value)}
          placeholder="Dietary tags"
          className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        />
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-zinc-300 p-3">
          <label className="flex flex-col gap-1 text-xs">
            Upload image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) =>
                void handleImageUpload(
                  event,
                  (value) => {
                    setLocalError(null);
                    setImageUrl(value);
                  },
                  setLocalError,
                )
              }
              className="text-xs"
            />
          </label>
          {imageUrl ? (
            <div className="flex items-center gap-3">
              <img src={imageUrl} alt="" className="h-16 w-16 rounded-md border object-cover" />
              <button type="button" onClick={() => setImageUrl('')} className="text-xs underline">
                Remove image
              </button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 text-xs">
            <p className="font-medium">Combo contents</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {comboChoices.map((choice) => (
                <label key={choice.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={comboOf.includes(choice.id)}
                    onChange={() => setComboOf((prev) => toggleComboId(prev, choice.id))}
                  />
                  <span>
                    {choice.name}
                    <span className="text-muted-foreground"> · {choice.categoryName}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            Modifiers JSON
            <textarea
              value={modifierJson}
              onChange={(e) => setModifierJson(e.target.value)}
              rows={6}
              className="border-input bg-background rounded-md border px-2 py-2 font-mono text-[11px]"
            />
          </label>
        </div>
        {localError ? (
          <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs">
            {localError}
          </p>
        ) : null}
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
            onClick={() => {
              setEditing(false);
              setName(item.name);
              setDescription(item.description ?? '');
              setPriceMajor((item.priceMinor / 100).toFixed(2));
              setDietaryTags(item.dietaryTags.join(', '));
              setImageUrl(item.imageUrl ?? '');
              setModifierJson(formatModifiers(item.modifiers));
              setComboOf(item.comboOf);
              setLocalError(null);
            }}
            className="border-input h-8 rounded-md border px-3 text-xs"
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}
