'use client';

import { useId, useState, useTransition, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  FieldError,
  FieldHint,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@menukaze/ui';
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
      <Tabs value={mode} onValueChange={(value) => setMode(value === 'csv' ? 'csv' : 'manual')}>
        <TabsList variant="segmented">
          <TabsTrigger value="manual" variant="segmented">
            Manual entry
          </TabsTrigger>
          <TabsTrigger value="csv" variant="segmented">
            CSV import
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === 'manual' ? (
        <>
          <label className="block space-y-1.5">
            <Label>Category name</Label>
            <Input
              type="text"
              required
              minLength={1}
              maxLength={120}
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
            <FieldHint>E.g. Appetizers, Mains, Desserts, Drinks.</FieldHint>
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
                  <Input
                    type="text"
                    placeholder={`Item ${index + 1} name`}
                    value={item.name}
                    onChange={(event) => updateItem(item.rowId, { name: event.target.value })}
                  />
                </div>
                <div className="w-32">
                  <label className="sr-only">Item {index + 1} price</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Price"
                    value={item.priceMajor}
                    onChange={(event) => updateItem(item.rowId, { priceMajor: event.target.value })}
                    className="text-right"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => removeItem(item.rowId)}
                  disabled={items.length === 1}
                  aria-label={`Remove item ${index + 1}`}
                  variant="outline"
                  size="icon"
                >
                  ×
                </Button>
              </div>
            ))}

            <Button type="button" onClick={addItem} variant="outline" size="sm">
              + Add another item
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <Label>Upload CSV</Label>
            <Input id={fileInputId} type="file" accept=".csv,text/csv" onChange={onCsvFileChange} />
            <FieldHint>
              Header row supported. Accepted columns: item/name, price, category, description.
            </FieldHint>
          </label>

          <label className="block space-y-1.5">
            <Label>Or paste from a spreadsheet</Label>
            <Textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows={8}
              placeholder={`item,price,category,description
Margherita,12.5,Pizza,Classic tomato
Tiramisu,8.25,Dessert,Coffee cream`}
            />
          </label>

          <label className="block space-y-1.5">
            <Label>Default category</Label>
            <Input
              type="text"
              value={defaultCategoryName}
              onChange={(event) => setDefaultCategoryName(event.target.value)}
            />
            <FieldHint>
              Used when the CSV does not include a category column or a row leaves it blank.
            </FieldHint>
          </label>
        </div>
      )}

      {error ? <FieldError>{error}</FieldError> : null}

      <Button type="submit" disabled={pending} full loading={pending}>
        {mode === 'manual' ? 'Save menu and continue' : 'Import CSV and continue'}
      </Button>
    </form>
  );
}
