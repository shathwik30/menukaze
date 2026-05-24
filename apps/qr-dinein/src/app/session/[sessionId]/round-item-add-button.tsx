'use client';

import { useState } from 'react';
import { maxSelectionsForModifierGroup, validateModifierSelection } from '@menukaze/shared';
import { Button, Checkbox, FieldError, cn } from '@menukaze/ui';
import { useRoundCart } from '@/stores/cart';

interface ModifierOption {
  name: string;
  priceMinor: number;
  priceLabel: string;
}

interface ModifierGroup {
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: ModifierOption[];
}

interface VariantOption {
  id: string;
  name: string;
  priceMinor: number;
  priceLabel: string;
  isDefault: boolean;
  soldOut: boolean;
}

interface Props {
  itemId: string;
  name: string;
  priceMinor: number;
  taxClassId?: string;
  currency: string;
  locale: string;
  variants: VariantOption[];
  modifiers: ModifierGroup[];
  disabled?: boolean;
}

export function RoundItemAddButton({
  itemId,
  name,
  priceMinor,
  taxClassId,
  currency,
  locale,
  variants,
  modifiers,
  disabled,
}: Props) {
  const addLine = useRoundCart((state) => state.addLine);
  const [open, setOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    defaultVariant?.id,
  );

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
    setSelectedVariantId(defaultVariant?.id);
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

  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ?? defaultVariant;
  const basePriceMinor = selectedVariant?.priceMinor ?? priceMinor;

  function addConfiguredItem() {
    if (selectedVariant?.soldOut) {
      setError(`${selectedVariant.name} is sold out.`);
      return;
    }
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

    addLine({
      itemId,
      name,
      priceMinor: basePriceMinor,
      ...(selectedVariant
        ? { variantId: selectedVariant.id, variantName: selectedVariant.name }
        : {}),
      ...(taxClassId ? { taxClassId } : {}),
      modifiers: result.modifiers,
    });
    resetConfigurator();
    flashAdded();
  }

  const previewTotalMinor =
    basePriceMinor +
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

  if (variants.length === 0 && modifiers.length === 0) {
    return (
      <Button
        type="button"
        onClick={() => {
          addLine({
            itemId,
            name,
            priceMinor,
            ...(taxClassId ? { taxClassId } : {}),
            modifiers: [],
          });
          flashAdded();
        }}
        variant="outline"
        size="xs"
      >
        {justAdded ? 'Added ✓' : 'Add'}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        variant="outline"
        size="xs"
      >
        {justAdded ? 'Added ✓' : 'Customize'}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 p-3 sm:items-center sm:justify-center"
          onClick={resetConfigurator}
        >
          <div
            className="bg-background w-full max-w-md rounded-2xl border p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{name}</h3>
                <p className="text-muted-foreground text-xs">
                  Base price {formatMoney(basePriceMinor)}
                </p>
              </div>
              <Button type="button" onClick={resetConfigurator} variant="link" size="xs">
                Close
              </Button>
            </div>

            <div className="mt-4 flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
              {variants.length > 0 ? (
                <section className="border-border rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Variant</p>
                      <p className="text-muted-foreground text-xs">Choose one</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {variants.map((variant) => {
                      const active = variant.id === selectedVariantId;
                      return (
                        <label
                          key={variant.id}
                          className={cn(
                            'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                            active
                              ? 'border-foreground bg-accent'
                              : 'border-input hover:bg-muted/40',
                            variant.soldOut && 'opacity-50',
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={active}
                              disabled={variant.soldOut}
                              onChange={() => setSelectedVariantId(variant.id)}
                            />
                            <span>{variant.name}</span>
                          </span>
                          <span className="font-mono text-xs">
                            {variant.soldOut ? 'Sold out' : variant.priceLabel}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              {modifiers.map((group) => {
                const optionNames = selected[group.name] ?? [];
                const limit = maxSelectionsForModifierGroup(group);
                const min = group.min ?? (group.required ? 1 : 0);
                const label =
                  min > 0 && limit === min
                    ? `Choose ${min}`
                    : min > 0
                      ? `Choose ${min}-${limit}`
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
                            className={cn(
                              'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                              active
                                ? 'border-foreground bg-accent'
                                : 'border-input hover:bg-muted/40',
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <Checkbox
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

            {error ? <FieldError className="mt-4">{error}</FieldError> : null}

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{formatMoney(previewTotalMinor)}</span>
              <Button type="button" onClick={addConfiguredItem} size="sm">
                Add to round
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
