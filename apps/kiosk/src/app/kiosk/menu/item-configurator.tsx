'use client';

import { useState } from 'react';
import { maxSelectionsForModifierGroup, validateModifierSelection } from '@menukaze/shared';
import { Button, Checkbox, FieldError, cn } from '@menukaze/ui';
import { useKioskCart } from '@/stores/cart';

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
  description?: string;
  priceMinor: number;
  taxClassId?: string;
  currency: string;
  locale: string;
  variants: VariantOption[];
  modifiers: ModifierGroup[];
  onClose: () => void;
  onAdded: () => void;
}

export function ItemConfigurator({
  itemId,
  name,
  description,
  priceMinor,
  taxClassId,
  currency,
  locale,
  variants,
  modifiers,
  onClose,
  onAdded,
}: Props) {
  const addLine = useKioskCart((s) => s.addLine);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    defaultVariant?.id,
  );

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

  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ?? defaultVariant;
  const basePriceMinor = selectedVariant?.priceMinor ?? priceMinor;

  function addToCart() {
    if (selectedVariant?.soldOut) {
      setError(`${selectedVariant.name} is sold out.`);
      return;
    }
    const selections = Object.entries(selected).flatMap(([groupName, names]) =>
      names.map((optionName) => ({ groupName, optionName })),
    );
    const result = validateModifierSelection(modifiers, selections, name);
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
    onAdded();
  }

  const previewTotal =
    basePriceMinor +
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6 portrait:p-8"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-5xl flex-col rounded-lg bg-white p-8 text-zinc-950 shadow-2xl landscape:max-h-[92dvh] landscape:max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.22em] text-emerald-700 uppercase">
              Customize
            </p>
            <h2 className="mt-1 text-3xl font-black">{name}</h2>
            {description ? <p className="mt-2 text-base text-zinc-600">{description}</p> : null}
            <p className="mt-2 text-sm font-bold text-zinc-500">Base {fmt(basePriceMinor)}</p>
          </div>
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            size="lg"
            className="h-16 px-8 text-lg font-bold active:bg-zinc-100"
          >
            Close
          </Button>
        </div>

        <div className="kiosk-scroll flex min-h-0 flex-1 flex-col gap-4 pr-1">
          {variants.length > 0 ? (
            <section className="rounded-lg border border-zinc-200 p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-lg font-black">Variant</p>
                  <p className="text-sm font-medium text-zinc-500">Choose one</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {variants.map((variant) => {
                  const active = variant.id === selectedVariantId;
                  return (
                    <label
                      key={variant.id}
                      className={cn(
                        'flex min-h-[4.5rem] cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors',
                        active
                          ? 'border-emerald-600 bg-emerald-50'
                          : 'border-zinc-200 bg-white active:bg-zinc-50',
                        variant.soldOut && 'opacity-50',
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          checked={active}
                          disabled={variant.soldOut}
                          onChange={() => setSelectedVariantId(variant.id)}
                        />
                        <span className="text-lg font-bold">{variant.name}</span>
                      </span>
                      <span className="font-mono text-base font-bold text-zinc-600">
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
                ? `Required · choose ${min}`
                : min > 0
                  ? `Required · choose ${min}-${limit}`
                  : limit === 1
                    ? 'Optional'
                    : `Optional · up to ${limit}`;
            return (
              <section key={group.name} className="rounded-lg border border-zinc-200 p-5">
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
                        className={cn(
                          'flex min-h-[4.5rem] cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors',
                          active
                            ? 'border-emerald-600 bg-emerald-50'
                            : 'border-zinc-200 bg-white active:bg-zinc-50',
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <Checkbox
                            className="size-6"
                            checked={active}
                            onChange={() => toggleOption(group, option.name)}
                          />
                          <span className="text-lg font-bold">{option.name}</span>
                        </span>
                        <span className="font-mono text-base font-bold text-zinc-600">
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
          <FieldError className="mt-4 rounded-lg bg-rose-100 px-4 py-3 text-sm font-bold text-rose-800">
            {error}
          </FieldError>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Item total</p>
            <span className="font-mono text-2xl font-black">{fmt(previewTotal)}</span>
          </div>
          <Button
            type="button"
            onClick={addToCart}
            variant="accent"
            size="2xl"
            className="h-20 flex-1 bg-emerald-500 text-2xl font-black text-zinc-950 active:bg-emerald-400"
          >
            Add to order
          </Button>
        </div>
      </div>
    </div>
  );
}
