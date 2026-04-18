'use client';

import { useId, useState, useTransition, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createMenuStarterAction } from '@/app/actions/menu';

interface ItemRow {
  rowId: number;
  name: string;
  priceMajor: string;
}

interface Props {
  currency: string;
}

let nextRowId = 0;
function newRow(): ItemRow {
  nextRowId += 1;
  return { rowId: nextRowId, name: '', priceMajor: '' };
}

export function MenuSetupForm({ currency }: Props) {
  const router = useRouter();
  const fileInputId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');

  const [categoryName, setCategoryName] = useState('Mains');
  const [items, setItems] = useState<ItemRow[]>(() => [newRow(), newRow(), newRow()]);
  const [defaultCategoryName, setDefaultCategoryName] = useState('General');
  const [csvText, setCsvText] = useState('');

  function updateItem(rowId: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it) => (it.rowId === rowId ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, newRow()]);
  }

  function removeItem(rowId: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.rowId !== rowId) : prev));
  }

  function onCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    void file.text().then(
      (text) => {
        setCsvText(text);
        setMode('csv');
      },
      () => setError('Could not read that CSV file. Try pasting the content instead.'),
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result =
        mode === 'manual'
          ? await createMenuStarterAction({
              mode: 'manual',
              menuName: 'Main Menu',
              categoryName: categoryName.trim(),
              items: items
                .map((it) => ({ name: it.name.trim(), priceMajor: Number(it.priceMajor) }))
                .filter(
                  (it) =>
                    it.name.length > 0 && Number.isFinite(it.priceMajor) && it.priceMajor >= 0,
                ),
            })
          : await createMenuStarterAction({
              mode: 'csv',
              menuName: 'Main Menu',
              csvText,
              defaultCategoryName: defaultCategoryName.trim(),
            });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/onboarding/tables');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`rounded-md border px-3 py-2 text-sm ${mode === 'manual' ? 'bg-foreground text-background' : 'border-input'}`}
        >
          Manual entry
        </button>
        <button
          type="button"
          onClick={() => setMode('csv')}
          className={`rounded-md border px-3 py-2 text-sm ${mode === 'csv' ? 'bg-foreground text-background' : 'border-input'}`}
        >
          CSV import
        </button>
      </div>

      {mode === 'manual' ? (
        <>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Category name</span>
            <input
              type="text"
              required
              minLength={1}
              maxLength={120}
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              E.g. Appetizers, Mains, Desserts, Drinks.
            </p>
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Items</span>
              <span className="text-muted-foreground text-xs">Prices in {currency}</span>
            </div>

            {items.map((item, index) => (
              <div key={item.rowId} className="flex items-start gap-2">
                <div className="flex-1">
                  <label className="sr-only">Item {index + 1} name</label>
                  <input
                    type="text"
                    placeholder={`Item ${index + 1} name`}
                    value={item.name}
                    onChange={(event) => updateItem(item.rowId, { name: event.target.value })}
                    className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  />
                </div>
                <div className="w-32">
                  <label className="sr-only">Item {index + 1} price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Price"
                    value={item.priceMajor}
                    onChange={(event) => updateItem(item.rowId, { priceMajor: event.target.value })}
                    className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-right text-sm focus-visible:ring-2 focus-visible:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.rowId)}
                  disabled={items.length === 1}
                  aria-label={`Remove item ${index + 1}`}
                  className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-10 w-10 items-center justify-center rounded-md border text-sm disabled:pointer-events-none disabled:opacity-30"
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addItem}
              className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm"
            >
              + Add another item
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Upload CSV</span>
            <input
              id={fileInputId}
              type="file"
              accept=".csv,text/csv"
              onChange={onCsvFileChange}
              className="border-input block w-full rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Header row supported. Accepted columns: item/name, price, category, description.
            </p>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Or paste from a spreadsheet</span>
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows={8}
              placeholder={`item,price,category,description
Margherita,12.5,Pizza,Classic tomato
Tiramisu,8.25,Dessert,Coffee cream`}
              className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Default category</span>
            <input
              type="text"
              value={defaultCategoryName}
              onChange={(event) => setDefaultCategoryName(event.target.value)}
              className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Used when the CSV does not include a category column or a row leaves it blank.
            </p>
          </label>
        </div>
      )}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
      >
        {pending
          ? 'Saving menu…'
          : mode === 'manual'
            ? 'Save menu and continue'
            : 'Import CSV and continue'}
      </button>
    </form>
  );
}
