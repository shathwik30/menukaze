'use client';

import { useState } from 'react';
import { maxSelectionsForModifierGroup, validateModifierSelection } from '@menukaze/shared';
import { useRoundCart } from '@/stores/cart';

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
  priceMinor: number;
  currency: string;
  locale: string;
  modifiers: ModifierGroup[];
  disabled?: boolean;
}

export function RoundItemAddButton({
  itemId,
  name,
  priceMinor,
  currency,
  locale,
  modifiers,
  disabled,
}: Props) {
  const add = useRoundCart((state) => state.add);
  const [open, setOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  function formatMoney(minor: number) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  }

  function flashAdded() {
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1200);
  }

  function resetConfigurator() {
    setOpen(false);
    setError(null);
    setSelected({});
  }

  function toggleOption(group: ModifierGroup, optionName: string) {
    setError(null);
    const current = selected[group.name] ?? [];
    if (current.includes(optionName)) {
      const next = current.filter((value) => value !== optionName);
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

  function addConfiguredItem() {
    const result = validateModifierSelection(
      modifiers,
      Object.entries(selected).flatMap(([groupName, optionNames]) =>
        optionNames.map((optionName) => ({ groupName, optionName })),
      ),
      name,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }

    add({
      itemId,
      name,
      priceMinor,
      modifiers: result.modifiers,
    });
    resetConfigurator();
    flashAdded();
  }

  const previewTotalMinor =
    priceMinor +
    modifiers.reduce((sum, group) => {
      const optionNames = selected[group.name] ?? [];
      return (
        sum +
        optionNames.reduce(
          (groupSum, optionName) =>
            groupSum +
            (group.options.find((option) => option.name === optionName)?.priceMinor ?? 0),
          0,
        )
      );
    }, 0);

  if (disabled) return null;

  if (modifiers.length === 0) {
    return (
      <button
        type="button"
        onClick={() => {
          add({ itemId, name, priceMinor, modifiers: [] });
          flashAdded();
        }}
        className="border-input rounded-md border px-2 py-1 text-xs"
      >
        {justAdded ? 'Added ✓' : 'Add'}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="border-input rounded-md border px-2 py-1 text-xs"
      >
        {justAdded ? 'Added ✓' : 'Customize'}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3 sm:items-center sm:justify-center">
          <div className="bg-background w-full max-w-md rounded-2xl border p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{name}</h3>
                <p className="text-muted-foreground text-xs">
                  Base price {formatMoney(priceMinor)}
                </p>
              </div>
              <button
                type="button"
                onClick={resetConfigurator}
                className="text-muted-foreground text-xs underline"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
              {modifiers.map((group) => {
                const optionNames = selected[group.name] ?? [];
                const limit = maxSelectionsForModifierGroup(group);
                const label =
                  group.required && limit === 1
                    ? 'Choose 1'
                    : group.required
                      ? `Choose 1-${limit}`
                      : limit === 1
                        ? 'Optional'
                        : `Optional, up to ${limit}`;
                return (
                  <section key={group.name} className="border-border rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{group.name}</p>
                        <p className="text-muted-foreground text-xs">{label}</p>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {optionNames.length}/{limit}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {group.options.map((option) => {
                        const active = optionNames.includes(option.name);
                        return (
                          <label
                            key={option.name}
                            className={
                              active
                                ? 'border-foreground bg-accent flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm'
                                : 'border-input flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm'
                            }
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={active}
                                onChange={() => toggleOption(group, option.name)}
                              />
                              <span>{option.name}</span>
                            </span>
                            <span className="font-mono text-xs">
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
              <p className="bg-destructive/10 text-destructive mt-4 rounded-md px-3 py-2 text-xs">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{formatMoney(previewTotalMinor)}</span>
              <button
                type="button"
                onClick={addConfiguredItem}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold"
              >
                Add to round
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
