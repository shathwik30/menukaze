'use client';

import { useState } from 'react';
import { maxSelectionsForModifierGroup, validateModifierSelection } from '@menukaze/shared';
import { Checkbox, FieldError, cn } from '@menukaze/ui';
import { cartLineKey, useRoundCart } from '@/stores/cart';

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
  /** Overlay mode: small circular button on top of a food image */
  compact?: boolean;
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
  compact,
}: Props) {
  const lines = useRoundCart((s) => s.lines);
  const addLine = useRoundCart((s) => s.addLine);
  const incrementLine = useRoundCart((s) => s.incrementLine);
  const decrementLine = useRoundCart((s) => s.decrementLine);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    defaultVariant?.id,
  );

  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ?? defaultVariant;
  const basePriceMinor = selectedVariant?.priceMinor ?? priceMinor;

  // Find matching lines in cart (item without modifiers = single key)
  const matchingLines = lines.filter((line) => line.itemId === itemId);
  const totalQty = matchingLines.reduce((sum, line) => sum + line.quantity, 0);
  const hasConfiguration = variants.length > 0 || modifiers.length > 0;

  function fmt(minor: number) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  }

  function resetSheet() {
    setSheetOpen(false);
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

  function addConfigured() {
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
    resetSheet();
  }

  function handleSimpleAdd() {
    addLine({
      itemId,
      name,
      priceMinor,
      ...(taxClassId ? { taxClassId } : {}),
      modifiers: [],
    });
  }

  function handleSimpleDecrement() {
    if (matchingLines.length === 0) return;
    const key = cartLineKey(matchingLines[matchingLines.length - 1]!);
    decrementLine(key);
  }

  function handleSimpleIncrement() {
    if (matchingLines.length === 0) {
      handleSimpleAdd();
      return;
    }
    const key = cartLineKey(matchingLines[matchingLines.length - 1]!);
    incrementLine(key);
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

  // -- COMPACT overlay mode (on food image) ---------------------------------
  if (compact) {
    if (totalQty === 0) {
      return (
        <>
          <button
            type="button"
            onClick={() => (hasConfiguration ? setSheetOpen(true) : handleSimpleAdd())}
            className="shadow-ink-950/20 flex size-8 items-center justify-center rounded-full bg-white shadow-md transition-transform active:scale-95"
            aria-label={`Add ${name}`}
          >
            <PlusIcon className="text-ink-950 size-4" />
          </button>
          {sheetOpen ? (
            <ModifierSheet
              name={name}
              variants={variants}
              selectedVariantId={selectedVariantId}
              modifiers={modifiers}
              selected={selected}
              previewTotal={fmt(previewTotalMinor)}
              error={error}
              onVariantChange={setSelectedVariantId}
              onToggle={toggleOption}
              onAdd={addConfigured}
              onClose={resetSheet}
            />
          ) : null}
        </>
      );
    }

    // Compact stepper -- shown when item is already in cart
    return (
      <>
        <div className="shadow-ink-950/20 flex h-8 items-center gap-0 overflow-hidden rounded-full bg-white shadow-md">
          <button
            type="button"
            onClick={hasConfiguration ? () => setSheetOpen(true) : handleSimpleDecrement}
            className="text-ink-950 active:bg-canvas-100 flex size-8 items-center justify-center transition-colors"
            aria-label="Remove one"
          >
            <MinusIcon className="size-3.5" />
          </button>
          <span className="text-ink-950 min-w-[1.25rem] text-center text-xs font-bold tabular-nums">
            {totalQty}
          </span>
          <button
            type="button"
            onClick={hasConfiguration ? () => setSheetOpen(true) : handleSimpleIncrement}
            className="text-ink-950 active:bg-canvas-100 flex size-8 items-center justify-center transition-colors"
            aria-label="Add one"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
        {sheetOpen ? (
          <ModifierSheet
            name={name}
            variants={variants}
            selectedVariantId={selectedVariantId}
            modifiers={modifiers}
            selected={selected}
            previewTotal={fmt(previewTotalMinor)}
            error={error}
            onVariantChange={setSelectedVariantId}
            onToggle={toggleOption}
            onAdd={addConfigured}
            onClose={resetSheet}
          />
        ) : null}
      </>
    );
  }

  // -- REGULAR mode (no image, inline in row) -------------------------------
  if (!hasConfiguration) {
    if (totalQty === 0) {
      return (
        <button
          type="button"
          onClick={handleSimpleAdd}
          className="border-ink-200 text-ink-950 hover:border-ink-400 active:bg-canvas-50 flex h-8 w-16 items-center justify-center rounded-full border bg-white text-xs font-semibold transition-colors"
        >
          Add
        </button>
      );
    }
    return (
      <div className="border-ink-200 flex h-8 items-center overflow-hidden rounded-full border bg-white">
        <button
          type="button"
          onClick={handleSimpleDecrement}
          className="text-ink-950 active:bg-canvas-50 flex size-8 items-center justify-center transition-colors"
          aria-label="Remove one"
        >
          <MinusIcon className="size-3.5" />
        </button>
        <span className="text-ink-950 min-w-[1.5rem] text-center text-xs font-bold tabular-nums">
          {totalQty}
        </span>
        <button
          type="button"
          onClick={handleSimpleIncrement}
          className="text-ink-950 active:bg-canvas-50 flex size-8 items-center justify-center transition-colors"
          aria-label="Add one"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>
    );
  }

  // Has variants or modifiers, regular mode
  return (
    <>
      {totalQty === 0 ? (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="border-ink-200 text-ink-950 hover:border-ink-400 active:bg-canvas-50 flex h-8 w-20 items-center justify-center gap-1 rounded-full border bg-white text-xs font-semibold transition-colors"
        >
          Add
          <ChevronUpIcon className="text-ink-400 size-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="bg-ink-950 flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-white transition-opacity active:opacity-80"
        >
          <span className="bg-saffron-500 flex size-4 items-center justify-center rounded-full text-[9px] font-bold">
            {totalQty}
          </span>
          Edit
        </button>
      )}

      {sheetOpen ? (
        <ModifierSheet
          name={name}
          variants={variants}
          selectedVariantId={selectedVariantId}
          modifiers={modifiers}
          selected={selected}
          previewTotal={fmt(previewTotalMinor)}
          error={error}
          onVariantChange={setSelectedVariantId}
          onToggle={toggleOption}
          onAdd={addConfigured}
          onClose={resetSheet}
        />
      ) : null}
    </>
  );
}

// -- Modifier bottom sheet ----------------------------------------------------

function ModifierSheet({
  name,
  variants,
  selectedVariantId,
  modifiers,
  selected,
  previewTotal,
  error,
  onVariantChange,
  onToggle,
  onAdd,
  onClose,
}: {
  name: string;
  variants: VariantOption[];
  selectedVariantId?: string;
  modifiers: ModifierGroup[];
  selected: Record<string, string[]>;
  previewTotal: string;
  error: string | null;
  onVariantChange: (variantId: string) => void;
  onToggle: (group: ModifierGroup, optionName: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-ink-950/50 absolute inset-0 backdrop-blur-sm"
        tabIndex={-1}
      />

      {/* Sheet */}
      <div className="relative w-full rounded-t-3xl bg-white shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="bg-ink-200 h-1 w-10 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pb-3">
          <div>
            <h3 className="text-ink-950 font-serif text-xl leading-tight font-medium">{name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-canvas-100 text-ink-500 hover:bg-canvas-200 mt-0.5 flex size-7 items-center justify-center rounded-full transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5">
          <div className="flex flex-col gap-4 pb-4">
            {variants.length > 0 ? (
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-ink-950 text-sm font-semibold">Variant</p>
                    <p className="text-ink-400 text-[11px]">Choose one</p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  {variants.map((variant) => {
                    const active = variant.id === selectedVariantId;
                    return (
                      <label
                        key={variant.id}
                        className={cn(
                          'flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 transition-all',
                          active
                            ? 'border-ink-950 bg-ink-950'
                            : 'border-ink-100 bg-canvas-50 hover:border-ink-200',
                          variant.soldOut && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            checked={active}
                            disabled={variant.soldOut}
                            onChange={() => onVariantChange(variant.id)}
                            className="accent-current"
                          />
                          <span
                            className={cn(
                              'text-sm font-medium',
                              active ? 'text-white' : 'text-ink-800',
                            )}
                          >
                            {variant.name}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'font-mono text-xs',
                            active ? 'text-ink-300' : 'text-ink-500',
                          )}
                        >
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
                <section key={group.name}>
                  <div className="mb-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-ink-950 text-sm font-semibold">{group.name}</p>
                      <p className="text-ink-400 text-[11px]">{label}</p>
                    </div>
                    {min > 0 ? (
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          optionNames.length >= min
                            ? 'bg-jade-100 text-jade-700'
                            : 'bg-mkrose-50 text-mkrose-600',
                        )}
                      >
                        {optionNames.length >= min ? 'Done' : 'Required'}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {group.options.map((option) => {
                      const active = optionNames.includes(option.name);
                      return (
                        <label
                          key={option.name}
                          className={cn(
                            'flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 transition-all',
                            active
                              ? 'border-ink-950 bg-ink-950'
                              : 'border-ink-100 bg-canvas-50 hover:border-ink-200',
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <Checkbox
                              checked={active}
                              onChange={() => onToggle(group, option.name)}
                            />
                            <span
                              className={cn(
                                'text-sm font-medium',
                                active ? 'text-white' : 'text-ink-800',
                              )}
                            >
                              {option.name}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'font-mono text-xs',
                              active ? 'text-ink-300' : 'text-ink-500',
                            )}
                          >
                            {option.priceMinor === 0 ? 'Incl.' : `+${option.priceLabel}`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {error ? <FieldError className="mx-5 mt-1">{error}</FieldError> : null}

        {/* CTA */}
        <div className="px-5 pt-3 pb-8">
          <button
            type="button"
            onClick={onAdd}
            className="bg-saffron-500 hover:bg-saffron-600 flex w-full items-center justify-between rounded-2xl px-5 py-4 font-semibold text-white transition-colors"
          >
            <span>Add to round</span>
            <span className="font-mono">{previewTotal}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Icons -------------------------------------------------------------------

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
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
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
