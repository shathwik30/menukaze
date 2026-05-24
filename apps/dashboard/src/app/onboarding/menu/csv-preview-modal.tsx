'use client';

import { useId, useState } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@menukaze/ui';
import type { MenuImportCategory } from '@/lib/menu-import';

interface CheckedItem {
  checked: boolean;
  name: string;
  priceMajor: number;
  description?: string;
}

interface CheckedCategory {
  name: string;
  items: CheckedItem[];
}

interface Props {
  raw: MenuImportCategory[];
  currency: string;
  onImport: (categories: MenuImportCategory[]) => void;
  onClose: () => void;
}

export function CsvPreviewModal({ raw, currency, onImport, onClose }: Props) {
  const titleId = useId();

  const [categories, setCategories] = useState<CheckedCategory[]>(() =>
    raw.map((cat) => ({
      name: cat.name,
      items: cat.items.map((it) => ({ ...it, checked: true })),
    })),
  );

  function toggleItem(catIndex: number, itemIndex: number) {
    setCategories((prev) =>
      prev.map((cat, ci) =>
        ci !== catIndex
          ? cat
          : {
              ...cat,
              items: cat.items.map((it, ii) =>
                ii !== itemIndex ? it : { ...it, checked: !it.checked },
              ),
            },
      ),
    );
  }

  function toggleCategory(catIndex: number) {
    setCategories((prev) =>
      prev.map((cat, ci) => {
        if (ci !== catIndex) return cat;
        const allChecked = cat.items.every((it) => it.checked);
        return { ...cat, items: cat.items.map((it) => ({ ...it, checked: !allChecked })) };
      }),
    );
  }

  const selectedCount = categories.reduce(
    (sum, cat) => sum + cat.items.filter((it) => it.checked).length,
    0,
  );

  function handleImport() {
    const selected: MenuImportCategory[] = categories
      .map((cat) => ({
        name: cat.name,
        items: cat.items
          .filter((it) => it.checked)
          .map(({ name, priceMajor, description }) => ({ name, priceMajor, description })),
      }))
      .filter((cat) => cat.items.length > 0);
    onImport(selected);
  }

  return (
    <Dialog open onClose={onClose} size="lg" labelledBy={titleId}>
      <DialogHeader>
        <DialogTitle id={titleId}>Review imported items</DialogTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          {selectedCount} of {categories.reduce((s, c) => s + c.items.length, 0)} items selected
          across {categories.length} {categories.length === 1 ? 'category' : 'categories'}. Uncheck
          anything you don&apos;t want to add.
        </p>
      </DialogHeader>

      <DialogBody>
        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {categories.map((cat, ci) => {
            const allChecked = cat.items.every((it) => it.checked);
            const someChecked = cat.items.some((it) => it.checked);
            return (
              <div key={cat.name} className="space-y-1.5">
                {/* Category header */}
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked && !allChecked;
                    }}
                    onChange={() => toggleCategory(ci)}
                  />
                  <span className="text-foreground text-sm font-semibold">{cat.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {cat.items.filter((it) => it.checked).length}/{cat.items.length}
                  </span>
                </label>

                {/* Items */}
                <div className="border-border ml-6 divide-y rounded-lg border">
                  {cat.items.map((item, ii) => (
                    <label
                      key={`${item.name}-${ii}`}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded"
                        checked={item.checked}
                        onChange={() => toggleItem(ci, ii)}
                      />
                      <span className="text-foreground min-w-0 flex-1 truncate text-sm">
                        {item.name}
                        {item.description ? (
                          <span className="text-muted-foreground ml-1 text-xs">
                            — {item.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">
                        {currency} {item.priceMajor.toFixed(2)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleImport} disabled={selectedCount === 0}>
          Add {selectedCount} {selectedCount === 1 ? 'item' : 'items'} to menu
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
