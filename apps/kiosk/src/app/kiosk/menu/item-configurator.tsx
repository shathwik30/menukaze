'use client';

import { useState } from 'react';
import { maxSelectionsForModifierGroup, validateModifierSelection } from '@menukaze/shared';
import { useKioskCart } from '@/stores/cart';

interface ModifierOption {
  name: string;
  priceMinor: number;
  priceLabel: string;
}

interface ModifierGroup {
  name: string;
  required: boolean;
  max: number;
  options: ModifierOption[];
}

interface Props {
  itemId: string;
  name: string;
  description?: string;
  priceMinor: number;
  currency: string;
  locale: string;
  modifiers: ModifierGroup[];
  onClose: () => void;
  onAdded: () => void;
}

export function ItemConfigurator({
  itemId,
  name,
  description,
  priceMinor,
  currency,
  locale,
  modifiers,
  onClose,
  onAdded,
}: Props) {
  const addLine = useKioskCart((s) => s.addLine);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  function fmt(minor: number) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  }

  function toggleOption(group: ModifierGroup, optionName: string) {
    setError(null);
    const current = selected[group.name] ?? [];
    if (current.includes(optionName)) {
      const next = current.filter((v) => v !== optionName);
      if (next.length === 0) {
        const { [group.name]: _removed, ...rest } = selected;
        setSelected(rest);
      } else {
        setSelected({ ...selected, [group.name]: next });
      }
      return;
    }
    const limit = maxSelectionsForModifierGroup(group);
    if (limit <= 1) {
      setSelected({ ...selected, [group.name]: [optionName] });
      return;
    }
    if (current.length >= limit) {
      setError(`${group.name} allows at most ${limit} selections.`);
      return;
    }
    setSelected({ ...selected, [group.name]: [...current, optionName] });
  }

  function addToCart() {
    const selections = Object.entries(selected).flatMap(([groupName, names]) =>
      names.map((optionName) => ({ groupName, optionName })),
    );
    const result = validateModifierSelection(modifiers, selections, name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    addLine({ itemId, name, priceMinor, modifiers: result.modifiers });
    onAdded();
  }

  const previewTotal =
    priceMinor +
    modifiers.reduce((sum, group) => {
      const names = selected[group.name] ?? [];
      return (
        sum +
        names.reduce(
          (gs, optName) => gs + (group.options.find((o) => o.name === optName)?.priceMinor ?? 0),
          0,
        )
      );
    }, 0);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-background w-full max-w-lg rounded-t-3xl p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{name}</h2>
            {description ? (
              <p className="text-muted-foreground mt-1 text-sm">{description}</p>
            ) : null}
            <p className="text-muted-foreground mt-1 text-sm">Base {fmt(priceMinor)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-input rounded-xl border px-4 py-2 text-sm font-medium"
          >
            Close
          </button>
        </div>

        {/* Modifier groups */}
        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
          {modifiers.map((group) => {
            const optionNames = selected[group.name] ?? [];
            const limit = maxSelectionsForModifierGroup(group);
            const label =
              group.required && limit === 1
                ? 'Required · choose 1'
                : group.required
                  ? `Required · choose 1–${limit}`
                  : limit === 1
                    ? 'Optional'
                    : `Optional · up to ${limit}`;
            return (
              <section key={group.name} className="border-border rounded-2xl border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{group.name}</p>
                    <p className="text-muted-foreground text-xs">{label}</p>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {optionNames.length}/{limit}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {group.options.map((option) => {
                    const active = optionNames.includes(option.name);
                    return (
                      <label
                        key={option.name}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors ${
                          active ? 'border-foreground bg-accent' : 'border-input'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            checked={active}
                            onChange={() => toggleOption(group, option.name)}
                          />
                          <span className="text-base">{option.name}</span>
                        </span>
                        <span className="font-mono text-sm">
                          {option.priceMinor === 0 ? 'Included' : `+${option.priceLabel}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {error ? (
          <p className="bg-destructive/10 text-destructive mt-4 rounded-xl px-4 py-2 text-sm">
            {error}
          </p>
        ) : null}

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between gap-4">
          <span className="text-xl font-bold">{fmt(previewTotal)}</span>
          <button
            type="button"
            onClick={addToCart}
            className="bg-primary text-primary-foreground h-14 flex-1 rounded-2xl text-lg font-bold active:opacity-80"
          >
            Add to order
          </button>
        </div>
      </div>
    </div>
  );
}
