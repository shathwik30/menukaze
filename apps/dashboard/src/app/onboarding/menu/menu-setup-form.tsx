'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { Button, FieldError, Input, Label, cn } from '@menukaze/ui';
import { createMenuStarterAction, skipMenuStepAction } from '@/app/actions/menu';
import { parseMenuCsvImport, type MenuImportCategory } from '@/lib/menu-import';
import { CsvPreviewModal } from './csv-preview-modal';

// ─── Draft types (client-only, never sent to server as-is) ───────────────────

interface DraftItem {
  id: string;
  name: string;
  priceMajor: string;
}

interface DraftCategory {
  id: string;
  name: string;
  items: DraftItem[];
}

let seq = 0;
function uid() {
  seq += 1;
  return `d${seq}`;
}

// ─── Sample CSV ──────────────────────────────────────────────────────────────

const SAMPLE_CSV =
  `name,price,category,description\n` +
  `Margherita,12.50,Mains,Classic tomato base with mozzarella\n` +
  `Pepperoni,14.00,Mains,Topped with spicy pepperoni\n` +
  `Veggie Supreme,13.00,Mains,Seasonal vegetables on herbed base\n` +
  `Tiramisu,6.50,Desserts,Italian coffee cream dessert\n` +
  `Chocolate Brownie,5.00,Desserts,Warm brownie with vanilla ice cream\n` +
  `Lemonade,3.50,Drinks,Fresh squeezed lemonade\n` +
  `Cold Coffee,4.00,Drinks,Chilled espresso with milk\n` +
  `Masala Chai,2.50,Drinks,Spiced Indian tea\n`;

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'menukaze-sample-menu.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  currency: string;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function MenuSetupForm({ currency }: Props) {
  const router = useRouter();
  const fileInputId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Staged menu
  const [categories, setCategories] = useState<DraftCategory[]>([]);

  // CSV
  const [dragOver, setDragOver] = useState(false);
  const [csvPreview, setCsvPreview] = useState<MenuImportCategory[] | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Add category inline form
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const catInputRef = useRef<HTMLInputElement>(null);

  // Add item inline form (one open at a time, keyed by category id)
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const itemNameRef = useRef<HTMLInputElement>(null);

  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);

  // Auto-focus category input when it opens
  useEffect(() => {
    if (addingCat) catInputRef.current?.focus();
  }, [addingCat]);

  // Auto-focus item name when add-item row opens
  useEffect(() => {
    if (addingItemFor) itemNameRef.current?.focus();
  }, [addingItemFor]);

  // ── Category helpers ──────────────────────────────────────────────────────

  function confirmAddCategory() {
    const name = newCatName.trim();
    if (!name) {
      setAddingCat(false);
      setNewCatName('');
      return;
    }
    setCategories((prev) => [...prev, { id: uid(), name, items: [] }]);
    setNewCatName('');
    setAddingCat(false);
    // Open add-item for the new category right away
    setAddingItemFor('__new__'); // will be replaced once category id is known via effect
  }

  function removeCategory(catId: string) {
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    if (addingItemFor === catId) setAddingItemFor(null);
  }

  // ── Item helpers ──────────────────────────────────────────────────────────

  function openAddItem(catId: string) {
    setAddingItemFor(catId);
    setNewItemName('');
    setNewItemPrice('');
  }

  function confirmAddItem(catId: string, keepOpen = true) {
    const name = newItemName.trim();
    const price = newItemPrice.trim();
    if (!name) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== catId
          ? c
          : { ...c, items: [...c.items, { id: uid(), name, priceMajor: price || '0' }] },
      ),
    );
    setNewItemName('');
    setNewItemPrice('');
    if (!keepOpen) setAddingItemFor(null);
    else itemNameRef.current?.focus();
  }

  function cancelAddItem() {
    setAddingItemFor(null);
    setNewItemName('');
    setNewItemPrice('');
  }

  function removeItem(catId: string, itemId: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id !== catId ? c : { ...c, items: c.items.filter((it) => it.id !== itemId) },
      ),
    );
  }

  function handleItemKeyDown(e: KeyboardEvent<HTMLInputElement>, catId: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmAddItem(catId, true);
    }
    if (e.key === 'Escape') cancelAddItem();
  }

  function handleCatKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmAddCategory();
    }
    if (e.key === 'Escape') {
      setAddingCat(false);
      setNewCatName('');
    }
  }

  // After a category is added, the `__new__` sentinel needs the real id
  useEffect(() => {
    if (addingItemFor !== '__new__') return;
    const last = categories[categories.length - 1];
    if (last) {
      setAddingItemFor(last.id);
      itemNameRef.current?.focus();
    }
  }, [categories, addingItemFor]);

  // ── CSV ───────────────────────────────────────────────────────────────────

  function parseCsvFile(file: File) {
    setCsvError(null);
    void file.text().then(
      (text) => {
        try {
          const parsed = parseMenuCsvImport(text);
          setCsvPreview(parsed);
        } catch (err) {
          setCsvError(err instanceof Error ? err.message : 'Could not parse that CSV.');
        }
      },
      () => setCsvError('Could not read the file.'),
    );
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseCsvFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseCsvFile(file);
  }

  function handleCsvImport(imported: MenuImportCategory[]) {
    setCategories((prev) => {
      const next = [...prev];
      for (const importedCat of imported) {
        const existing = next.find((c) => c.name.toLowerCase() === importedCat.name.toLowerCase());
        if (existing) {
          existing.items = [
            ...existing.items,
            ...importedCat.items.map((it) => ({
              id: uid(),
              name: it.name,
              priceMajor: String(it.priceMajor),
            })),
          ];
        } else {
          next.push({
            id: uid(),
            name: importedCat.name,
            items: importedCat.items.map((it) => ({
              id: uid(),
              name: it.name,
              priceMajor: String(it.priceMajor),
            })),
          });
        }
      }
      return next;
    });
    setCsvPreview(null);
  }

  // ── Submit / Skip ─────────────────────────────────────────────────────────

  function onSave() {
    setError(null);
    const nonEmptyCategories = categories
      .map((c) => ({
        name: c.name,
        items: c.items
          .map((it) => ({ name: it.name, priceMajor: Number(it.priceMajor) }))
          .filter(
            (it) => it.name.length > 0 && Number.isFinite(it.priceMajor) && it.priceMajor >= 0,
          ),
      }))
      .filter((c) => c.items.length > 0);

    if (nonEmptyCategories.length === 0) {
      setError('Add at least one item before continuing.');
      return;
    }

    startTransition(async () => {
      const result = await createMenuStarterAction({
        mode: 'manual',
        menuName: 'Main Menu',
        categories: nonEmptyCategories,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/onboarding/tables');
    });
  }

  function onSkip() {
    setError(null);
    startTransition(async () => {
      const result = await skipMenuStepAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/onboarding/tables');
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── CSV import zone ───────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <Label>Import from a spreadsheet</Label>
          <button
            type="button"
            onClick={downloadSampleCsv}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs underline underline-offset-2 transition-colors"
          >
            <DownloadIcon className="h-3 w-3" />
            Download sample CSV
          </button>
        </div>

        <label
          htmlFor={fileInputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'border-border flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            dragOver
              ? 'border-foreground bg-accent/20'
              : 'hover:border-foreground/40 hover:bg-muted/20',
          )}
        >
          <UploadCloudIcon className="text-muted-foreground h-8 w-8" />
          <p className="text-foreground text-sm font-medium">
            Drop a CSV here, or <span className="underline">click to browse</span>
          </p>
          <p className="text-muted-foreground text-xs">
            Columns: <span className="font-mono">name, price, category, description</span>
          </p>
        </label>
        <input
          id={fileInputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={onFileChange}
        />
        {csvError ? <FieldError className="mt-2">{csvError}</FieldError> : null}
      </section>

      {/* ── Menu builder ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <Label>Your menu</Label>
          {totalItems > 0 ? (
            <span className="text-muted-foreground text-xs">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </span>
          ) : null}
        </div>

        {categories.length === 0 && !addingCat ? (
          <div className="border-border rounded-xl border border-dashed px-6 py-10 text-center">
            <p className="text-muted-foreground text-sm">
              No items yet. Add a category below or drop a CSV above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => (
              <CategorySection
                key={cat.id}
                cat={cat}
                currency={currency}
                addingItemFor={addingItemFor}
                newItemName={newItemName}
                newItemPrice={newItemPrice}
                itemNameRef={addingItemFor === cat.id ? itemNameRef : undefined}
                onOpenAddItem={() => openAddItem(cat.id)}
                onItemNameChange={setNewItemName}
                onItemPriceChange={setNewItemPrice}
                onConfirmItem={(keep) => confirmAddItem(cat.id, keep)}
                onCancelItem={cancelAddItem}
                onItemKeyDown={(e) => handleItemKeyDown(e, cat.id)}
                onRemoveItem={(itemId) => removeItem(cat.id, itemId)}
                onRemoveCategory={() => removeCategory(cat.id)}
              />
            ))}
          </div>
        )}

        {/* Add category form */}
        {addingCat ? (
          <div className="border-border flex items-center gap-2 rounded-lg border p-3">
            <Input
              ref={catInputRef}
              type="text"
              placeholder="Category name, e.g. Mains"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={handleCatKeyDown}
              maxLength={120}
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={confirmAddCategory}
              disabled={!newCatName.trim()}
            >
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAddingCat(false);
                setNewCatName('');
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCat(true)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            Add category
          </button>
        )}
      </section>

      {/* ── Errors + actions ─────────────────────────────────────────── */}
      {error ? <FieldError>{error}</FieldError> : null}

      <div className="space-y-3">
        <Button
          type="button"
          onClick={onSave}
          disabled={pending || totalItems === 0}
          loading={pending}
          full
        >
          Save menu and continue
        </Button>
        <div className="text-center">
          <button
            type="button"
            onClick={onSkip}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2 transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>
      </div>

      {/* ── CSV preview modal ─────────────────────────────────────────── */}
      {csvPreview ? (
        <CsvPreviewModal
          raw={csvPreview}
          currency={currency}
          onImport={handleCsvImport}
          onClose={() => setCsvPreview(null)}
        />
      ) : null}
    </div>
  );
}

// ─── CategorySection sub-component ───────────────────────────────────────────

interface CategorySectionProps {
  cat: DraftCategory;
  currency: string;
  addingItemFor: string | null;
  newItemName: string;
  newItemPrice: string;
  itemNameRef?: React.RefObject<HTMLInputElement | null>;
  onOpenAddItem: () => void;
  onItemNameChange: (v: string) => void;
  onItemPriceChange: (v: string) => void;
  onConfirmItem: (keepOpen: boolean) => void;
  onCancelItem: () => void;
  onItemKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onRemoveItem: (itemId: string) => void;
  onRemoveCategory: () => void;
}

function CategorySection({
  cat,
  currency,
  addingItemFor,
  newItemName,
  newItemPrice,
  itemNameRef,
  onOpenAddItem,
  onItemNameChange,
  onItemPriceChange,
  onConfirmItem,
  onCancelItem,
  onItemKeyDown,
  onRemoveItem,
  onRemoveCategory,
}: CategorySectionProps) {
  const isAdding = addingItemFor === cat.id;

  return (
    <div className="border-border rounded-xl border">
      {/* Category header */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-foreground text-sm font-semibold">{cat.name}</span>
        <button
          type="button"
          onClick={onRemoveCategory}
          className="text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors"
          aria-label={`Remove ${cat.name} category`}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Items */}
      {cat.items.length > 0 ? (
        <ul className="border-border divide-border divide-y border-t">
          {cat.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-foreground min-w-0 flex-1 truncate text-sm">{item.name}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {currency} {Number(item.priceMajor).toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() => onRemoveItem(item.id)}
                className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 transition-colors"
                aria-label={`Remove ${item.name}`}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Inline add-item row */}
      {isAdding ? (
        <div className="border-border flex items-center gap-2 border-t px-3 py-2.5">
          <Input
            ref={itemNameRef}
            type="text"
            placeholder="Item name"
            value={newItemName}
            onChange={(e) => onItemNameChange(e.target.value)}
            onKeyDown={onItemKeyDown}
            className="flex-1 text-sm"
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Price"
            value={newItemPrice}
            onChange={(e) => onItemPriceChange(e.target.value)}
            onKeyDown={onItemKeyDown}
            className="w-24 text-right text-sm"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onConfirmItem(true)}
            disabled={!newItemName.trim()}
            aria-label="Confirm item"
          >
            <CheckIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onCancelItem}
            aria-label="Cancel"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="border-border border-t px-4 py-2">
          <button
            type="button"
            onClick={onOpenAddItem}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add item
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tiny inline icons (no extra dep) ────────────────────────────────────────

function UploadCloudIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
