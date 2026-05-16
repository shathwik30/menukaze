'use client';

import { Checkbox, ImageCrop, Textarea } from '@menukaze/ui';
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  createMenuAction,
  createCategoryAction,
  createItemAction,
  updateCategoryAction,
  updateItemAction,
  deleteCategoryAction,
  deleteItemAction,
  toggleItemSoldOutAction,
} from '@/app/actions/menu-admin';

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ActionRunner = <T>(
  fn: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>,
) => void;

function parseDietaryTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}
function formatModifiers(mods: ManagerModifierGroup[]): string {
  return mods.length === 0 ? '[]' : JSON.stringify(mods, null, 2);
}
function parseModifiers(value: string): ManagerModifierGroup[] {
  const t = value.trim();
  if (!t) return [];
  return z.array(modifierGroupSchema).parse(JSON.parse(t));
}
function toggleComboId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
}

const TAG_STYLE: Record<string, { bg: string; fg: string }> = {
  signature: { bg: 'var(--mk-saffron-50)', fg: 'var(--mk-saffron-700)' },
  premium: { bg: 'var(--mk-rose-50)', fg: 'var(--mk-rose-700)' },
  veg: { bg: '#f0fdf4', fg: '#166534' },
  gf: { bg: 'var(--mk-canvas-100)', fg: 'var(--mk-ink-500)' },
  spicy: { bg: '#fff7ed', fg: '#c2410c' },
};
function tagStyle(tag: string): { bg: string; fg: string } {
  return TAG_STYLE[tag.toLowerCase()] ?? { bg: 'var(--mk-canvas-100)', fg: 'var(--mk-ink-500)' };
}

// ─── Root ────────────────────────────────────────────────────────────────────

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

  const firstMenu = menus[0];
  const firstCat = firstMenu?.categories[0];
  const [selectedMenuId, setSelectedMenuId] = useState(firstMenu?.id ?? '');
  const [selectedCatId, setSelectedCatId] = useState(firstCat?.id ?? '');
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ManagerItem | null>(null);

  const selectedMenu = menus.find((m) => m.id === selectedMenuId) ?? menus[0];
  const allCategories = menus.flatMap((m) =>
    m.categories.map((c) => ({ ...c, menuId: m.id, menuName: m.name })),
  );
  const selectedCat =
    allCategories.find((c) => c.id === selectedCatId) ?? selectedMenu?.categories[0];
  const soldOutCount = selectedCat ? selectedCat.items.filter((i) => i.soldOut).length : 0;

  function run<T>(fn: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  if (menus.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            padding: '72px 32px',
            textAlign: 'center',
            borderRadius: 16,
            border: '1.5px dashed var(--mk-ink-200)',
            background: 'var(--mk-canvas-50)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 500,
              color: 'var(--mk-ink-700)',
            }}
          >
            No menus yet
          </div>
          <p style={{ fontSize: 13, color: 'var(--mk-ink-400)', marginTop: 6 }}>
            Create a menu to start adding categories and dishes.
          </p>
          {canEdit ? (
            <button onClick={() => setAddMenuOpen(true)} style={darkBtn(false)} type="button">
              + Create menu
            </button>
          ) : null}
        </div>
        {addMenuOpen ? (
          <AddMenuForm
            pending={isPending}
            onSubmit={(name) => {
              run(() => createMenuAction({ name, order: 0 }));
              setAddMenuOpen(false);
            }}
            onCancel={() => setAddMenuOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {error ? (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 9,
            background: 'var(--mk-rose-50)',
            color: 'var(--mk-rose-700)',
            fontSize: 13,
            fontWeight: 500,
            border: '1px solid var(--mk-rose-100)',
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px minmax(0, 1fr)',
          gap: 0,
          border: '1px solid var(--mk-ink-100)',
          borderRadius: 14,
          overflow: 'hidden',
          background: 'white',
          boxShadow: '0 1px 3px rgb(0 0 0 / 0.04)',
        }}
      >
        {/* ── Sidebar ── */}
        <aside
          style={{
            borderRight: '1px solid var(--mk-ink-100)',
            background: 'var(--mk-canvas-50)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Categories section */}
          <div
            style={{
              padding: '16px 14px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={eyebrow}>Categories</span>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setAddCatOpen((v) => !v)}
                title="Add category"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: addCatOpen ? 'var(--mk-ink-950)' : 'transparent',
                  color: addCatOpen ? 'white' : 'var(--mk-ink-500)',
                  border: '1px solid var(--mk-ink-200)',
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                +
              </button>
            ) : null}
          </div>

          {addCatOpen && canEdit ? (
            <div style={{ padding: '0 14px 10px' }}>
              <AddCategoryInline
                menus={menus}
                defaultMenuId={selectedMenuId}
                pending={isPending}
                onSubmit={(menuId, name) => {
                  run(() => createCategoryAction({ menuId, name, order: 0 }));
                  setAddCatOpen(false);
                }}
                onCancel={() => setAddCatOpen(false)}
              />
            </div>
          ) : null}

          <nav style={{ flex: 1, overflowY: 'auto' }}>
            {menus.map((menu) => (
              <div key={menu.id}>
                {menus.length > 1 ? (
                  <div
                    style={{
                      padding: '8px 16px 4px',
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--mk-ink-300)',
                    }}
                  >
                    {menu.name}
                  </div>
                ) : null}
                {menu.categories.map((cat) => {
                  const active = cat.id === selectedCat?.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedMenuId(menu.id);
                        setSelectedCatId(cat.id);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 16px',
                        fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        color: active ? 'var(--mk-ink-950)' : 'var(--mk-ink-600)',
                        background: active ? 'white' : 'transparent',
                        borderLeft: `3px solid ${active ? 'var(--mk-saffron-500)' : 'transparent'}`,
                        border: 'none',
                        borderLeftStyle: 'solid',
                        borderLeftWidth: 3,
                        borderLeftColor: active ? 'var(--mk-saffron-500)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 120ms',
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cat.name}
                      </span>
                      <span
                        style={{
                          flexShrink: 0,
                          marginLeft: 6,
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: active ? 'var(--mk-ink-600)' : 'var(--mk-ink-400)',
                        }}
                      >
                        {cat.items.length}
                      </span>
                    </button>
                  );
                })}
                {menu.categories.length === 0 ? (
                  <div
                    style={{
                      padding: '8px 16px',
                      fontSize: 12,
                      color: 'var(--mk-ink-300)',
                      fontStyle: 'italic',
                    }}
                  >
                    No categories
                  </div>
                ) : null}
              </div>
            ))}
          </nav>

          {/* Menus section */}
          <div style={{ borderTop: '1px solid var(--mk-ink-100)', padding: '12px 14px 6px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span style={eyebrow}>Menus</span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setAddMenuOpen((v) => !v)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: addMenuOpen ? 'var(--mk-ink-950)' : 'transparent',
                    color: addMenuOpen ? 'white' : 'var(--mk-ink-500)',
                    border: '1px solid var(--mk-ink-200)',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  +
                </button>
              ) : null}
            </div>
            {addMenuOpen && canEdit ? (
              <div style={{ marginBottom: 8 }}>
                <AddMenuForm
                  pending={isPending}
                  inline
                  onSubmit={(name) => {
                    run(() => createMenuAction({ name, order: menus.length }));
                    setAddMenuOpen(false);
                  }}
                  onCancel={() => setAddMenuOpen(false)}
                />
              </div>
            ) : null}
            {menus.map((menu) => {
              const isScheduled = Boolean(menu.schedule);
              return (
                <div
                  key={menu.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 2px',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMenuId(menu.id);
                      const fc = menu.categories[0];
                      if (fc) setSelectedCatId(fc.id);
                    }}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: selectedMenuId === menu.id ? 'var(--mk-ink-950)' : 'var(--mk-ink-600)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {menu.name}
                  </button>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0,
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: 99,
                      background: isScheduled ? 'var(--mk-lapis-50)' : 'var(--mk-jade-50)',
                      color: isScheduled ? 'var(--mk-lapis-700)' : 'var(--mk-jade-700)',
                    }}
                  >
                    {!isScheduled ? (
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 99,
                          background: 'var(--mk-jade-500)',
                        }}
                      />
                    ) : null}
                    {isScheduled ? 'Scheduled' : 'Live'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Currency chip */}
          <div style={{ padding: '8px 14px 14px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--mk-ink-400)',
                background: 'var(--mk-canvas-100)',
                padding: '3px 8px',
                borderRadius: 6,
              }}
            >
              {currencyLabel}
            </span>
          </div>
        </aside>

        {/* ── Right panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 600 }}>
          {selectedCat ? (
            <>
              {/* Category header */}
              <div
                style={{
                  padding: '20px 28px 16px',
                  borderBottom: '1px solid var(--mk-ink-100)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: 'var(--font-serif)',
                      fontSize: 28,
                      fontWeight: 500,
                      letterSpacing: '-0.02em',
                      color: 'var(--mk-ink-950)',
                    }}
                  >
                    {selectedCat.name}
                  </h2>
                  <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--mk-ink-400)' }}>
                    {selectedCat.items.length} item{selectedCat.items.length !== 1 ? 's' : ''}
                    {soldOutCount > 0 ? (
                      <span style={{ color: 'var(--mk-rose-600)' }}>
                        {' '}
                        · {soldOutCount} sold out
                      </span>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Search */}
                  <div style={{ position: 'relative' }}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      style={{
                        width: 13,
                        height: 13,
                        position: 'absolute',
                        left: 9,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--mk-ink-400)',
                        pointerEvents: 'none',
                      }}
                      aria-hidden
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    <input
                      type="search"
                      placeholder="Search this category…"
                      style={{
                        height: 32,
                        paddingLeft: 28,
                        paddingRight: 10,
                        width: 190,
                        fontSize: 12.5,
                        border: '1px solid var(--mk-ink-200)',
                        borderRadius: 8,
                        background: 'var(--mk-canvas-50)',
                        outline: 'none',
                        fontFamily: 'inherit',
                        color: 'var(--mk-ink-950)',
                      }}
                    />
                  </div>
                  {canEdit ? (
                    <>
                      <CategoryActionsMenu category={selectedCat} pending={isPending} run={run} />
                    </>
                  ) : null}
                </div>
              </div>

              {/* Item grid or edit panel */}
              <div style={{ flex: 1, padding: editingItem ? 0 : '20px 28px' }}>
                {editingItem ? (
                  <ItemEditPanel
                    item={editingItem}
                    availableItems={availableItems}
                    pending={isPending}
                    run={run}
                    onClose={() => setEditingItem(null)}
                  />
                ) : selectedCat.items.length === 0 && !addItemOpen ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mk-ink-500)' }}>
                      No items in this category
                    </div>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setAddItemOpen(true)}
                        style={{ marginTop: 12, ...darkBtn(false) }}
                      >
                        + Add first item
                      </button>
                    ) : null}
                  </div>
                ) : !editingItem ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                      gap: 14,
                    }}
                  >
                    {selectedCat.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        pending={isPending}
                        run={run}
                        canEdit={canEdit}
                        canToggleAvailability={canToggleAvailability}
                        onEdit={(it) => setEditingItem(it)}
                      />
                    ))}

                    {/* Add item card */}
                    {canEdit ? (
                      addItemOpen ? (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <AddItemForm
                            categoryId={selectedCat.id}
                            availableItems={availableItems}
                            pending={isPending}
                            run={run}
                            onClose={() => setAddItemOpen(false)}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddItemOpen(true)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            minHeight: 200,
                            borderRadius: 12,
                            border: '1.5px dashed var(--mk-ink-200)',
                            background: 'var(--mk-canvas-50)',
                            color: 'var(--mk-ink-400)',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                            transition: 'border-color 120ms, color 120ms',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--mk-saffron-400)';
                            e.currentTarget.style.color = 'var(--mk-saffron-700)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--mk-ink-200)';
                            e.currentTarget.style.color = 'var(--mk-ink-400)';
                          }}
                        >
                          <span
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 99,
                              border: '1.5px solid currentColor',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 20,
                              lineHeight: 1,
                            }}
                          >
                            +
                          </span>
                          Add an item
                        </button>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--mk-ink-400)',
                fontSize: 13,
              }}
            >
              Select a category
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  pending,
  run,
  canEdit,
  canToggleAvailability,
  onEdit,
}: {
  item: ManagerItem;
  pending: boolean;
  run: ActionRunner;
  canEdit: boolean;
  canToggleAvailability: boolean;
  onEdit: (item: ManagerItem) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  return (
    <article
      style={{
        borderRadius: 12,
        border: '1px solid var(--mk-ink-100)',
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        opacity: item.soldOut ? 0.85 : 1,
        boxShadow: '0 1px 2px rgb(0 0 0 / 0.04)',
      }}
    >
      {/* Image area */}
      <div
        style={{
          position: 'relative',
          height: 160,
          background: 'var(--mk-canvas-50)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--mk-ink-100) 0, var(--mk-ink-100) 1px, transparent 0, transparent 50%)',
              backgroundSize: '14px 14px',
            }}
          >
            <span style={{ fontSize: 11.5, color: 'var(--mk-ink-300)', fontWeight: 500 }}>
              · drop photo ·
            </span>
          </div>
        )}
        {/* Sold-out overlay */}
        {item.soldOut ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'oklch(0.1 0 0 / 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'white',
              }}
            >
              Sold out
            </span>
          </div>
        ) : null}
      </div>

      {/* Body */}
      <div
        style={{
          padding: '12px 14px 0',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {/* Name + price */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span
            style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--mk-ink-950)', lineHeight: 1.3 }}
          >
            {item.name}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--mk-ink-800)',
              flexShrink: 0,
            }}
          >
            {item.priceLabel}
          </span>
        </div>

        {/* Description */}
        {item.description ? (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--mk-ink-400)',
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.description}
          </p>
        ) : null}

        {/* Tags */}
        {item.dietaryTags.length > 0 || item.soldOut ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {item.dietaryTags.map((tag) => {
              const ts = tagStyle(tag);
              return (
                <span
                  key={tag}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 5,
                    background: ts.bg,
                    color: ts.fg,
                  }}
                >
                  {tag}
                </span>
              );
            })}
            {item.soldOut ? (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: 'var(--mk-rose-50)',
                  color: 'var(--mk-rose-700)',
                }}
              >
                Sold out
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Footer: toggle + more */}
      <div
        style={{
          padding: '10px 14px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 'auto',
        }}
      >
        {canToggleAvailability ? (
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
          >
            <AvailToggle
              available={!item.soldOut}
              pending={pending}
              onChange={() =>
                run(() => toggleItemSoldOutAction({ id: item.id, soldOut: !item.soldOut }))
              }
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: item.soldOut ? 'var(--mk-ink-400)' : 'var(--mk-ink-600)',
              }}
            >
              {item.soldOut ? 'Hidden' : 'Available'}
            </span>
          </label>
        ) : (
          <div />
        )}

        {/* More button */}
        {canEdit ? (
          <div style={{ position: 'relative' }}>
            <button
              ref={moreRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--mk-ink-400)',
                background: menuOpen ? 'var(--mk-canvas-100)' : 'transparent',
                border: '1px solid transparent',
                cursor: 'pointer',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ width: 14, height: 14 }}
                aria-hidden
              >
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {menuOpen ? (
              <MoreMenu anchor={moreRef.current} onClose={() => setMenuOpen(false)}>
                <MoreItem
                  label="Edit item"
                  onClick={() => {
                    onEdit(item);
                    setMenuOpen(false);
                  }}
                />
                {canToggleAvailability ? (
                  <MoreItem
                    label={item.soldOut ? 'Mark available' : 'Mark sold out'}
                    onClick={() => {
                      run(() => toggleItemSoldOutAction({ id: item.id, soldOut: !item.soldOut }));
                      setMenuOpen(false);
                    }}
                  />
                ) : null}
                <MoreItem
                  label="Delete"
                  danger
                  onClick={() => {
                    if (window.confirm(`Delete "${item.name}"?`))
                      run(() => deleteItemAction(item.id));
                    setMenuOpen(false);
                  }}
                />
              </MoreMenu>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ─── Available toggle ─────────────────────────────────────────────────────────

function AvailToggle({
  available,
  pending,
  onChange,
}: {
  available: boolean;
  pending: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={available}
      disabled={pending}
      onClick={onChange}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        borderRadius: 99,
        background: available ? 'var(--mk-jade-500)' : 'var(--mk-ink-250, var(--mk-ink-200))',
        border: 'none',
        cursor: pending ? 'not-allowed' : 'pointer',
        padding: 0,
        transition: 'background 180ms',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: available ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 99,
          background: 'white',
          boxShadow: '0 1px 3px rgb(0 0 0 / 0.25)',
          transition: 'left 180ms',
        }}
      />
    </button>
  );
}

// ─── More menu ────────────────────────────────────────────────────────────────

function MoreMenu({
  anchor,
  children,
  onClose,
}: {
  anchor: HTMLElement | null;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [anchor]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && e.target !== anchor) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchor]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: pos.top,
        right: pos.right,
        zIndex: 9999,
        background: 'white',
        borderRadius: 10,
        border: '1px solid var(--mk-ink-100)',
        boxShadow: '0 8px 32px rgb(0 0 0 / 0.12)',
        padding: '4px',
        minWidth: 150,
      }}
    >
      {children}
    </div>
  );
}

function MoreItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: 500,
        color: danger ? 'var(--mk-rose-700)' : 'var(--mk-ink-700)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'var(--mk-rose-50)' : 'var(--mk-canvas-50)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );
}

// ─── Category actions ─────────────────────────────────────────────────────────

function CategoryActionsMenu({
  category,
  pending,
  run,
}: {
  category: ManagerCategory & { menuId?: string; menuName?: string };
  pending: boolean;
  run: ActionRunner;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const manageRef = useRef<HTMLButtonElement>(null);

  if (editOpen) {
    return (
      <form
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            updateCategoryAction({ id: category.id, name: name.trim(), order: category.order }),
          );
          setEditOpen(false);
        }}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            height: 32,
            padding: '0 10px',
            fontSize: 12.5,
            border: '1px solid var(--mk-ink-200)',
            borderRadius: 8,
            outline: 'none',
            fontFamily: 'inherit',
          }}
          autoFocus
        />
        <button type="submit" disabled={pending} style={smallBtn(false)}>
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditOpen(false);
            setName(category.name);
          }}
          style={ghostSmallBtn}
        >
          Cancel
        </button>
      </form>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={manageRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          height: 32,
          padding: '0 12px',
          borderRadius: 8,
          border: '1px solid var(--mk-ink-200)',
          background: 'white',
          color: 'var(--mk-ink-600)',
          fontSize: 12.5,
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          cursor: 'pointer',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          style={{ width: 13, height: 13 }}
          aria-hidden
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        Manage
      </button>
      {open ? (
        <MoreMenu anchor={manageRef.current} onClose={() => setOpen(false)}>
          <MoreItem
            label="Rename"
            onClick={() => {
              setEditOpen(true);
              setOpen(false);
            }}
          />
          <MoreItem
            label="Delete category"
            danger
            onClick={() => {
              if (window.confirm(`Delete "${category.name}" and all its items?`))
                run(() => deleteCategoryAction(category.id));
              setOpen(false);
            }}
          />
        </MoreMenu>
      ) : null}
    </div>
  );
}

// ─── Add category inline ──────────────────────────────────────────────────────

function AddCategoryInline({
  menus,
  defaultMenuId,
  pending,
  onSubmit,
  onCancel,
}: {
  menus: ManagerMenu[];
  defaultMenuId: string;
  pending: boolean;
  onSubmit: (menuId: string, name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [menuId, setMenuId] = useState(defaultMenuId);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(menuId, name.trim());
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Category name…"
        autoFocus
        required
        style={{
          height: 32,
          padding: '0 10px',
          fontSize: 12.5,
          border: '1px solid var(--mk-ink-200)',
          borderRadius: 8,
          outline: 'none',
          fontFamily: 'inherit',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
      {menus.length > 1 ? (
        <select
          value={menuId}
          onChange={(e) => setMenuId(e.target.value)}
          style={{
            height: 28,
            fontSize: 11.5,
            border: '1px solid var(--mk-ink-200)',
            borderRadius: 7,
            padding: '0 8px',
            fontFamily: 'inherit',
          }}
        >
          {menus.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : null}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          style={{ ...smallBtn(pending || !name.trim()), flex: 1 }}
        >
          Add
        </button>
        <button type="button" onClick={onCancel} style={ghostSmallBtn}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Add menu form ────────────────────────────────────────────────────────────

function AddMenuForm({
  pending,
  inline,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  inline?: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
      style={{
        display: 'flex',
        gap: 6,
        flexDirection: inline ? 'column' : 'row',
        alignItems: inline ? 'stretch' : 'center',
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Menu name…"
        autoFocus
        required
        style={{
          height: 32,
          padding: '0 10px',
          fontSize: 12.5,
          border: '1px solid var(--mk-ink-200)',
          borderRadius: 8,
          outline: 'none',
          fontFamily: 'inherit',
          flex: inline ? undefined : 1,
          width: inline ? '100%' : undefined,
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          style={{ ...smallBtn(pending || !name.trim()), flex: inline ? 1 : undefined }}
        >
          Create
        </button>
        <button type="button" onClick={onCancel} style={ghostSmallBtn}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Add item form ────────────────────────────────────────────────────────────

function AddItemForm({
  categoryId,
  availableItems,
  pending,
  run,
  onClose,
}: {
  categoryId: string;
  availableItems: ManagerItemChoice[];
  pending: boolean;
  run: ActionRunner;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [priceMajor, setPriceMajor] = useState('');
  const [description, setDescription] = useState('');
  const [dietaryTags, setDietaryTags] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [modifierJson, setModifierJson] = useState('[]');
  const [comboOf, setComboOf] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--mk-ink-200)',
        borderRadius: 12,
        padding: 20,
        background: 'var(--mk-canvas-50)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mk-ink-800)', marginBottom: 14 }}>
        New item
      </div>
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
            onClose();
          } catch (err) {
            setLocalError(err instanceof Error ? err.message : 'Invalid modifiers JSON.');
          }
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
          <input
            type="text"
            placeholder="Item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={fieldInput}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Price"
            value={priceMajor}
            onChange={(e) => setPriceMajor(e.target.value)}
            required
            style={{ ...fieldInput, width: 90 }}
          />
        </div>
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={fieldInput}
        />
        <input
          type="text"
          placeholder="Tags e.g. veg, gf, signature"
          value={dietaryTags}
          onChange={(e) => setDietaryTags(e.target.value)}
          style={fieldInput}
        />

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 12,
            color: 'var(--mk-lapis-600)',
            cursor: 'pointer',
            textAlign: 'left',
            padding: 0,
          }}
        >
          {showAdvanced ? '▾' : '▸'} Advanced (image, modifiers, combos)
        </button>

        {showAdvanced ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 9,
              border: '1px dashed var(--mk-ink-200)',
              background: 'white',
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--mk-ink-600)' }}>
              Item image
            </div>
            <ImageCrop
              label="item photo"
              value={imageUrl || null}
              onChange={(v) => {
                setLocalError(null);
                setImageUrl(v);
              }}
              onRemove={() => setImageUrl('')}
              aspectRatio={1}
            />
            {availableItems.length > 0 ? (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--mk-ink-600)' }}>
                  Combo contents
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {availableItems.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <Checkbox
                        checked={comboOf.includes(c.id)}
                        onChange={() => setComboOf((prev) => toggleComboId(prev, c.id))}
                      />
                      <span>
                        {c.name}{' '}
                        <span style={{ color: 'var(--mk-ink-400)' }}>· {c.categoryName}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : null}
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--mk-ink-600)' }}>
              Modifiers JSON
            </div>
            <Textarea
              value={modifierJson}
              onChange={(e) => setModifierJson(e.target.value)}
              rows={5}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
            />
          </div>
        ) : null}

        {localError ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--mk-rose-700)',
              background: 'var(--mk-rose-50)',
              padding: '8px 12px',
              borderRadius: 8,
            }}
          >
            {localError}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            disabled={pending || !name.trim() || !priceMajor}
            style={darkBtn(pending || !name.trim() || !priceMajor)}
          >
            Add item
          </button>
          <button type="button" onClick={onClose} style={outlineBtn}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Item edit panel ──────────────────────────────────────────────────────────

function ItemEditPanel({
  item,
  availableItems,
  pending,
  run,
  onClose,
}: {
  item: ManagerItem;
  availableItems: ManagerItemChoice[];
  pending: boolean;
  run: ActionRunner;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [priceMajor, setPriceMajor] = useState((item.priceMinor / 100).toFixed(2));
  const [description, setDescription] = useState(item.description ?? '');
  const [dietaryTags, setDietaryTags] = useState(item.dietaryTags.join(', '));
  const [imageUrl, setImageUrl] = useState(item.imageUrl ?? '');
  const [modifierJson, setModifierJson] = useState(formatModifiers(item.modifiers));
  const [comboOf, setComboOf] = useState(item.comboOf);
  const [localError, setLocalError] = useState<string | null>(null);
  const comboChoices = availableItems.filter((c) => c.id !== item.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Panel header */}
      <div
        style={{
          padding: '16px 28px',
          borderBottom: '1px solid var(--mk-ink-100)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--mk-canvas-50)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 30,
            padding: '0 10px',
            borderRadius: 7,
            border: '1px solid var(--mk-ink-200)',
            background: 'white',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--mk-ink-600)',
            cursor: 'pointer',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ width: 12, height: 12 }}
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <div style={{ width: 1, height: 18, background: 'var(--mk-ink-150, var(--mk-ink-200))' }} />
        <div>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--mk-saffron-700)',
            }}
          >
            Editing item
          </div>
          <div
            style={{ fontSize: 14, fontWeight: 600, color: 'var(--mk-ink-950)', lineHeight: 1.2 }}
          >
            {item.name}
          </div>
        </div>
      </div>

      {/* Scrollable form body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 32px' }}>
        <form
          id="item-edit-form"
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
              onClose();
            } catch (err) {
              setLocalError(err instanceof Error ? err.message : 'Invalid modifiers JSON.');
            }
          }}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}
        >
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <EditSection title="Basic info">
              <FieldLabel label="Name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={fieldInput}
                />
              </FieldLabel>
              <FieldLabel label="Price">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceMajor}
                  onChange={(e) => setPriceMajor(e.target.value)}
                  required
                  style={{ ...fieldInput, maxWidth: 140 }}
                />
              </FieldLabel>
              <FieldLabel label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Short description shown on the menu…"
                  style={{
                    ...fieldInput,
                    height: 'auto',
                    padding: '8px 10px',
                    resize: 'vertical',
                    lineHeight: 1.5,
                  }}
                />
              </FieldLabel>
              <FieldLabel label="Dietary tags" hint="Comma-separated: veg, gf, signature, spicy…">
                <input
                  type="text"
                  value={dietaryTags}
                  onChange={(e) => setDietaryTags(e.target.value)}
                  placeholder="e.g. veg, gf"
                  style={fieldInput}
                />
                {dietaryTags.trim() ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {parseDietaryTags(dietaryTags).map((t) => {
                      const ts = tagStyle(t);
                      return (
                        <span
                          key={t}
                          style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 5,
                            background: ts.bg,
                            color: ts.fg,
                          }}
                        >
                          {t}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </FieldLabel>
            </EditSection>

            <EditSection title="Photo">
              <ImageCrop
                label="item photo"
                value={imageUrl || null}
                onChange={(v) => {
                  setLocalError(null);
                  setImageUrl(v);
                }}
                onRemove={() => setImageUrl('')}
                aspectRatio={1}
              />
            </EditSection>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {comboChoices.length > 0 ? (
              <EditSection title="Combo contents" hint="Mark this item as a bundle of other items">
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}
                >
                  {comboChoices.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12.5,
                        cursor: 'pointer',
                        padding: '5px 8px',
                        borderRadius: 7,
                        background: comboOf.includes(c.id) ? 'var(--mk-saffron-50)' : 'transparent',
                        border: `1px solid ${comboOf.includes(c.id) ? 'var(--mk-saffron-200)' : 'var(--mk-ink-100)'}`,
                        transition: 'all 100ms',
                      }}
                    >
                      <Checkbox
                        checked={comboOf.includes(c.id)}
                        onChange={() => setComboOf((prev) => toggleComboId(prev, c.id))}
                      />
                      <span
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: comboOf.includes(c.id) ? 600 : 400,
                        }}
                      >
                        {c.name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--mk-ink-400)', flexShrink: 0 }}>
                        {c.categoryName}
                      </span>
                    </label>
                  ))}
                </div>
              </EditSection>
            ) : null}

            <EditSection
              title="Modifiers"
              hint="JSON array — each group has name, required, max, options[]"
            >
              <Textarea
                value={modifierJson}
                onChange={(e) => setModifierJson(e.target.value)}
                rows={10}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6 }}
              />
            </EditSection>
          </div>
        </form>

        {localError ? (
          <div
            role="alert"
            style={{
              marginTop: 16,
              fontSize: 12.5,
              color: 'var(--mk-rose-700)',
              background: 'var(--mk-rose-50)',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--mk-rose-100)',
            }}
          >
            {localError}
          </div>
        ) : null}
      </div>

      {/* Sticky footer */}
      <div
        style={{
          padding: '14px 28px',
          borderTop: '1px solid var(--mk-ink-100)',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <button
          type="submit"
          form="item-edit-form"
          disabled={pending || !name.trim() || !priceMajor}
          style={darkBtn(pending || !name.trim() || !priceMajor)}
        >
          Save changes
        </button>
        <button type="button" onClick={onClose} style={outlineBtn}>
          Discard
        </button>
        {pending ? <span style={{ fontSize: 12, color: 'var(--mk-ink-400)' }}>Saving…</span> : null}
      </div>
    </div>
  );
}

function EditSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--mk-ink-500)',
          }}
        >
          {title}
        </div>
        {hint ? (
          <div style={{ fontSize: 11, color: 'var(--mk-ink-400)', marginTop: 2 }}>{hint}</div>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

function FieldLabel({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--mk-ink-700)' }}>
        {label}
        {hint ? (
          <span style={{ fontWeight: 400, color: 'var(--mk-ink-400)', marginLeft: 4 }}>{hint}</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const eyebrow: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--mk-ink-400)',
};

const fieldInput: CSSProperties = {
  height: 34,
  padding: '0 10px',
  fontSize: 13,
  border: '1.5px solid var(--mk-ink-200)',
  borderRadius: 8,
  fontFamily: 'inherit',
  background: 'white',
  color: 'var(--mk-ink-950)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

function darkBtn(disabled: boolean): CSSProperties {
  return {
    height: 34,
    padding: '0 14px',
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 700,
    border: 'none',
    background: disabled ? 'var(--mk-ink-200)' : 'var(--mk-ink-950)',
    color: disabled ? 'var(--mk-ink-500)' : 'var(--mk-canvas-50)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
const outlineBtn: CSSProperties = {
  height: 34,
  padding: '0 12px',
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid var(--mk-ink-200)',
  background: 'white',
  color: 'var(--mk-ink-700)',
  cursor: 'pointer',
};

function smallBtn(disabled: boolean): CSSProperties {
  return {
    height: 28,
    padding: '0 10px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 700,
    border: 'none',
    background: disabled ? 'var(--mk-ink-200)' : 'var(--mk-ink-950)',
    color: disabled ? 'var(--mk-ink-500)' : 'var(--mk-canvas-50)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
const ghostSmallBtn: CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--mk-ink-200)',
  background: 'white',
  color: 'var(--mk-ink-600)',
  cursor: 'pointer',
};
