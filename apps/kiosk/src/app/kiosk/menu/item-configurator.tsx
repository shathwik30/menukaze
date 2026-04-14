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
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-t-lg bg-white p-6 text-zinc-950 shadow-2xl sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">
              Customize
            </p>
            <h2 className="mt-1 text-3xl font-black">{name}</h2>
            {description ? <p className="mt-2 text-base text-zinc-600">{description}</p> : null}
            <p className="mt-2 text-sm font-bold text-zinc-500">Base {fmt(priceMinor)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-lg border border-zinc-300 px-4 text-sm font-bold active:bg-zinc-100"
          >
            Close
          </button>
        </div>

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
              <section key={group.name} className="rounded-lg border border-zinc-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-black">{group.name}</p>
                    <p className="text-sm font-medium text-zinc-500">{label}</p>
                  </div>
                  <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-black text-zinc-600">
                    {optionNames.length}/{limit}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {group.options.map((option) => {
                    const active = optionNames.includes(option.name);
                    return (
                      <label
                        key={option.name}
                        className={`flex min-h-14 cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors ${
                          active
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-zinc-200 bg-white active:bg-zinc-50'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-6 w-6 accent-emerald-600"
                            checked={active}
                            onChange={() => toggleOption(group, option.name)}
                          />
                          <span className="text-base font-bold">{option.name}</span>
                        </span>
                        <span className="font-mono text-sm font-bold text-zinc-600">
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
          <p className="mt-4 rounded-lg bg-rose-100 px-4 py-3 text-sm font-bold text-rose-800">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Item total</p>
            <span className="font-mono text-2xl font-black">{fmt(previewTotal)}</span>
          </div>
          <button
            type="button"
            onClick={addToCart}
            className="h-16 flex-1 rounded-lg bg-emerald-500 text-xl font-black text-zinc-950 active:bg-emerald-400"
          >
            Add to order
          </button>
        </div>
      </div>
    </div>
  );
}
