'use client';

import { useState } from 'react';
import { maxSelectionsForModifierGroup, validateModifierSelection } from '@menukaze/shared';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  FieldError,
  cn,
} from '@menukaze/ui';
import { useCart } from '@/stores/cart';

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

export function AddToCartButton({
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
  const addLine = useCart((s) => s.addLine);
  const [justAdded, setJustAdded] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    defaultVariant?.id,
  );

  if (disabled) {
    return (
      <span className="text-ink-400 dark:text-ink-500 text-xs tracking-[0.12em] uppercase">
        Unavailable
      </span>
    );
  }

  function flashAdded() {
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1500);
  }

  function resetConfigurator() {
    setOpen(false);
    setError(null);
    setSelected({});
    setSelectedVariantId(defaultVariant?.id);
  }

  function formatMoney(minor: number) {
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

  if (variants.length === 0 && modifiers.length === 0) {
    return (
      <Button
        type="button"
        size="sm"
        variant={justAdded ? 'accent' : 'outline'}
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
        aria-label={`Add ${name} to cart`}
      >
        {justAdded ? (
          <>
            <CheckIcon /> Added
          </>
        ) : (
          <>
            <PlusIcon /> Add
          </>
        )}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={justAdded ? 'accent' : 'outline'}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={`Customize ${name}`}
      >
        {justAdded ? (
          <>
            <CheckIcon /> Added
          </>
        ) : (
          <>
            <SlidersIcon /> Customize
          </>
        )}
      </Button>

      <Dialog open={open} onClose={resetConfigurator} size="md" position="bottom">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>{name}</DialogTitle>
              <DialogDescription>
                From <span className="mk-nums font-mono">{formatMoney(basePriceMinor)}</span>
              </DialogDescription>
            </div>
            <Button
              type="button"
              onClick={resetConfigurator}
              aria-label="Close"
              variant="ghost"
              size="icon-sm"
              className="text-ink-500 hover:bg-canvas-100 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-canvas-50 rounded-lg p-1.5 transition-colors"
            >
              <CloseIcon />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-6 pb-2">
          {variants.length > 0 ? (
            <fieldset className="border-ink-200 bg-canvas-50/70 dark:border-ink-800 dark:bg-ink-900/50 rounded-xl border p-4">
              <legend className="bg-surface text-ink-950 dark:bg-ink-900 dark:text-canvas-50 -mt-6 mb-0 px-2 text-[13px] font-semibold tracking-tight">
                Variant
              </legend>
              <div className="mt-2 space-y-1.5">
                {variants.map((variant) => {
                  const active = variant.id === selectedVariantId;
                  return (
                    <label
                      key={variant.id}
                      className={cn(
                        'flex cursor-pointer items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm transition-all duration-150',
                        active
                          ? 'border-saffron-500 bg-saffron-50 ring-saffron-500 dark:border-saffron-400 dark:bg-saffron-500/15 ring-1'
                          : 'border-ink-200 bg-surface hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900/80 dark:hover:border-ink-700',
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
                        <span>{variant.name}</span>
                      </span>
                      <span className="font-mono text-xs">
                        {variant.soldOut ? 'Sold out' : variant.priceLabel}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          {modifiers.map((group) => {
            const optionNames = selected[group.name] ?? [];
            const limit = maxSelectionsForModifierGroup(group);
            const min = group.min ?? (group.required ? 1 : 0);
            const label =
              min > 0 && limit === min
                ? `Required · Pick ${min}`
                : min > 0
                  ? `Required · Pick ${min}-${limit}`
                  : limit === 1
                    ? 'Optional'
                    : `Optional · Up to ${limit}`;
            return (
              <fieldset
                key={group.name}
                className="border-ink-200 bg-canvas-50/70 dark:border-ink-800 dark:bg-ink-900/50 rounded-xl border p-4"
              >
                <legend className="bg-surface text-ink-950 dark:bg-ink-900 dark:text-canvas-50 -mt-6 mb-0 px-2 text-[13px] font-semibold tracking-tight">
                  {group.name}
                </legend>
                <div className="-mt-1 flex items-center justify-between gap-3">
                  <p className="text-ink-500 dark:text-ink-400 text-[11px] font-medium tracking-[0.14em] uppercase">
                    {label}
                  </p>
                  <Badge variant="subtle" size="xs">
                    {optionNames.length}/{limit}
                  </Badge>
                </div>
                <div className="mt-3 space-y-1.5">
                  {group.options.map((option) => {
                    const active = optionNames.includes(option.name);
                    return (
                      <label
                        key={option.name}
                        className={cn(
                          'flex cursor-pointer items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm transition-all duration-150',
                          active
                            ? 'border-saffron-500 bg-saffron-50 ring-saffron-500 dark:border-saffron-400 dark:bg-saffron-500/15 ring-1'
                            : 'border-ink-200 bg-surface hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900/80 dark:hover:border-ink-700',
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                              active
                                ? 'border-saffron-600 bg-saffron-500 text-white'
                                : 'border-ink-300 bg-surface dark:border-ink-600 dark:bg-ink-800',
                            )}
                          >
                            {active ? (
                              <svg
                                viewBox="0 0 16 16"
                                className="size-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <polyline points="3 8 7 12 13 4" />
                              </svg>
                            ) : null}
                          </span>
                          <Checkbox
                            checked={active}
                            onChange={() => toggleOption(group, option.name)}
                            className="sr-only"
                          />
                          <span className="font-medium">{option.name}</span>
                        </span>
                        <span className="mk-nums text-ink-500 dark:text-ink-400 font-mono text-xs">
                          {option.priceMinor === 0 ? 'Included' : `+${option.priceLabel}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {error ? (
            <FieldError className="border-mkrose-200 bg-mkrose-50 dark:border-mkrose-500/30 dark:bg-mkrose-500/10 rounded-lg border px-3 py-2.5">
              {error}
            </FieldError>
          ) : null}
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-3">
            <div className="text-left">
              <p className="text-ink-500 dark:text-ink-400 text-[11px] font-medium tracking-[0.12em] uppercase">
                Total
              </p>
              <p className="mk-nums text-foreground font-serif text-xl font-medium">
                {formatMoney(previewTotalMinor)}
              </p>
            </div>
            <Button type="button" size="lg" variant="primary" onClick={addConfiguredItem}>
              Add to cart
            </Button>
          </div>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function SlidersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
