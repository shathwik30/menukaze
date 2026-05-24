'use client';

import { Button, Input, Radio, Select, Textarea } from '@menukaze/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { computeTax, type TaxRule } from '@menukaze/shared';
import { createWalkInOrderAction } from '@/app/actions/walk-in';

export interface WalkInModifierOption {
  name: string;
  priceMinor: number;
  priceLabel: string;
}

export interface WalkInModifierGroup {
  name: string;
  required: boolean;
  max: number;
  options: WalkInModifierOption[];
}

export interface WalkInItem {
  id: string;
  categoryId: string;
  name: string;
  priceMinor: number;
  priceLabel: string;
  soldOut: boolean;
  modifiers: WalkInModifierGroup[];
}

export interface WalkInTable {
  id: string;
  name: string;
  capacity: number;
  status: string;
}

interface CategoryRef {
  id: string;
  name: string;
}

interface CartLine {
  key: string;
  itemId: string;
  name: string;
  unitMinor: number;
  quantity: number;
  modifiers: { groupName: string; optionName: string; priceMinor: number }[];
  notes?: string;
  lineTotalMinor: number;
}

type PaymentMethod = 'cash' | 'pay_later';

interface Props {
  items: WalkInItem[];
  categories: CategoryRef[];
  tables: WalkInTable[];
  currency: string;
  locale: string;
  taxRules: TaxRule[];
}

export function WalkInForm({ items, categories, tables, currency, locale, taxRules }: Props) {
  const router = useRouter();
  const [orderType, setOrderType] = useState<'dine_in' | 'pickup'>('pickup');
  const [tableId, setTableId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>(categories[0]?.id ?? '');
  const [configuringItem, setConfiguringItem] = useState<WalkInItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const formatMoney = useMemo(
    () => (minor: number) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(minor / 100),
    [locale, currency],
  );

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, WalkInItem[]>();
    for (const item of items) {
      const list = map.get(item.categoryId) ?? [];
      list.push(item);
      map.set(item.categoryId, list);
    }
    return map;
  }, [items]);

  const subtotalMinor = lines.reduce((s, l) => s + l.lineTotalMinor, 0);
  const { taxMinor, surchargeMinor } = computeTax(subtotalMinor, taxRules);
  const totalMinor = subtotalMinor + surchargeMinor;

  const addSimpleItem = (item: WalkInItem): void => {
    if (item.soldOut) return;
    if (item.modifiers.length > 0) {
      setConfiguringItem(item);
      return;
    }
    addLine(item, [], '');
  };

  const addLine = (
    item: WalkInItem,
    modifiers: { groupName: string; optionName: string; priceMinor: number }[],
    notes: string,
  ): void => {
    setError(null);
    setSuccess(null);
    const modKey = modifiers
      .map((m) => `${m.groupName}:${m.optionName}`)
      .sort()
      .join('|');
    const noteKey = notes.trim();
    const key = `${item.id}#${modKey}#${noteKey}`;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      const unitMinor = item.priceMinor + modifiers.reduce((s, m) => s + m.priceMinor, 0);
      if (idx >= 0) {
        const next = prev.slice();
        const existing = next[idx]!;
        const quantity = existing.quantity + 1;
        next[idx] = {
          ...existing,
          quantity,
          lineTotalMinor: unitMinor * quantity,
        };
        return next;
      }
      return [
        ...prev,
        {
          key,
          itemId: item.id,
          name: item.name,
          unitMinor,
          quantity: 1,
          modifiers,
          ...(noteKey ? { notes: noteKey } : {}),
          lineTotalMinor: unitMinor,
        },
      ];
    });
  };

  const incrementLine = (key: string): void =>
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, quantity: l.quantity + 1, lineTotalMinor: l.unitMinor * (l.quantity + 1) }
          : l,
      ),
    );

  const decrementLine = (key: string): void =>
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      if (idx < 0) return prev;
      const existing = prev[idx]!;
      if (existing.quantity <= 1) return prev.filter((l) => l.key !== key);
      const next = prev.slice();
      next[idx] = {
        ...existing,
        quantity: existing.quantity - 1,
        lineTotalMinor: existing.unitMinor * (existing.quantity - 1),
      };
      return next;
    });

  const removeLine = (key: string): void => setLines((prev) => prev.filter((l) => l.key !== key));

  const onSubmit = (): void => {
    setError(null);
    setSuccess(null);
    if (lines.length === 0) {
      setError('Add at least one item.');
      return;
    }
    if (orderType === 'dine_in' && !tableId) {
      setError('Pick a table for dine-in orders.');
      return;
    }
    startSubmit(async () => {
      const result = await createWalkInOrderAction({
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        type: orderType,
        ...(orderType === 'dine_in' && tableId ? { tableId } : {}),
        paymentMethod,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          modifiers: l.modifiers,
          ...(l.notes ? { notes: l.notes } : {}),
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(`Order ${result.data.publicOrderId} sent to the KDS.`);
      setLines([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      router.refresh();
    });
  };

  const visibleCategoryItems = activeCategoryId
    ? (itemsByCategory.get(activeCategoryId) ?? [])
    : items;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="border-border space-y-4 rounded-md border p-4">
        <h2 className="text-base font-semibold">Menu</h2>

        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Button
                variant="plain"
                size="none"
                key={c.id}
                type="button"
                onClick={() => setActiveCategoryId(c.id)}
                className={`rounded-md border px-3 py-1 text-xs ${
                  activeCategoryId === c.id
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {c.name}
              </Button>
            ))}
          </div>
        ) : null}

        {visibleCategoryItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No items in this category. Add menu items in <span className="font-mono">Menu</span>.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {visibleCategoryItems.map((item) => (
              <li key={item.id}>
                <Button
                  variant="plain"
                  size="none"
                  type="button"
                  onClick={() => addSimpleItem(item)}
                  disabled={item.soldOut}
                  className="border-border hover:bg-muted/40 flex w-full items-center justify-between rounded-md border p-3 text-left text-sm disabled:opacity-50"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{item.name}</span>
                    {item.soldOut ? (
                      <span className="text-xs text-red-600">Sold out</span>
                    ) : item.modifiers.length > 0 ? (
                      <span className="text-muted-foreground text-xs">Has options</span>
                    ) : null}
                  </span>
                  <span className="font-mono text-xs">{item.priceLabel}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="border-border space-y-4 rounded-md border p-4">
        <h2 className="text-base font-semibold">Order</h2>

        <fieldset className="grid grid-cols-2 gap-2 text-sm">
          <legend className="sr-only">Order type</legend>
          {(['pickup', 'dine_in'] as const).map((type) => (
            <label
              key={type}
              className={`border-border flex cursor-pointer items-center justify-center rounded-md border p-2 ${
                orderType === type ? 'bg-accent' : 'hover:bg-muted/40'
              }`}
            >
              <Radio
                name="type"
                value={type}
                checked={orderType === type}
                onChange={() => {
                  setOrderType(type);
                  if (type === 'pickup') setTableId('');
                }}
                className="sr-only"
              />
              <span className="text-xs font-medium tracking-wide uppercase">
                {type === 'pickup' ? 'Takeaway' : 'Dine-in'}
              </span>
            </label>
          ))}
        </fieldset>

        {orderType === 'dine_in' ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Table</span>
            <Select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="border-border h-9 rounded-md border px-2 text-sm"
            >
              <option value="">Pick a table</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · cap {t.capacity}
                  {t.status !== 'available' ? ` · ${t.status.replace('_', ' ')}` : ''}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Customer name <span className="text-muted-foreground">(optional)</span>
          </span>
          <Input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Walk-in customer"
            className="border-border h-9 rounded-md border px-3"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Phone <span className="text-muted-foreground">(optional)</span>
          </span>
          <Input
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="border-border h-9 rounded-md border px-3"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            Email <span className="text-muted-foreground">(optional)</span>
          </span>
          <Input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="customer@example.com"
            className="border-border h-9 rounded-md border px-3"
          />
        </label>

        <fieldset className="grid grid-cols-2 gap-2 text-sm">
          <legend className="sr-only">Payment method</legend>
          {(['cash', 'pay_later'] as const).map((method) => (
            <label
              key={method}
              className={`border-border flex cursor-pointer items-center justify-center rounded-md border p-2 ${
                paymentMethod === method ? 'bg-accent' : 'hover:bg-muted/40'
              }`}
            >
              <Radio
                name="payment"
                value={method}
                checked={paymentMethod === method}
                onChange={() => setPaymentMethod(method)}
                className="sr-only"
              />
              <span className="text-xs font-medium tracking-wide uppercase">
                {method === 'cash' ? 'Cash' : 'Pay later'}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="border-border space-y-2 rounded-md border p-3 text-sm">
          {lines.length === 0 ? (
            <p className="text-muted-foreground text-xs">No items in the order yet.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((line) => (
                <li key={line.key} className="border-border border-b pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {line.quantity} × {line.name}
                    </span>
                    <span className="font-mono text-xs">{formatMoney(line.lineTotalMinor)}</span>
                  </div>
                  {line.modifiers.length > 0 ? (
                    <ul className="text-muted-foreground mt-1 ml-4 list-disc text-xs">
                      {line.modifiers.map((m, i) => (
                        <li key={`${m.groupName}-${i}`}>
                          {m.groupName}: {m.optionName}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {line.notes ? (
                    <p className="text-muted-foreground mt-1 ml-4 text-xs italic">
                      Note: {line.notes}
                    </p>
                  ) : null}
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    <Button
                      variant="plain"
                      size="none"
                      type="button"
                      onClick={() => decrementLine(line.key)}
                      className="border-border hover:bg-muted h-6 w-6 rounded border"
                    >
                      −
                    </Button>
                    <Button
                      variant="plain"
                      size="none"
                      type="button"
                      onClick={() => incrementLine(line.key)}
                      className="border-border hover:bg-muted h-6 w-6 rounded border"
                    >
                      +
                    </Button>
                    <Button
                      variant="plain"
                      size="none"
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="ml-auto text-red-600 hover:underline"
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-mono">{formatMoney(subtotalMinor)}</dd>
          </div>
          {taxMinor > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="font-mono">{formatMoney(taxMinor)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd className="font-mono">{formatMoney(totalMinor)}</dd>
          </div>
        </dl>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

        <Button
          variant="plain"
          size="none"
          type="button"
          onClick={onSubmit}
          disabled={submitting || lines.length === 0}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium disabled:opacity-50"
        >
          {submitting ? 'Placing order…' : 'Place order'}
        </Button>
      </aside>

      {configuringItem ? (
        <ItemConfigurator
          item={configuringItem}
          onCancel={() => setConfiguringItem(null)}
          onAdd={(modifiers, notes) => {
            addLine(configuringItem, modifiers, notes);
            setConfiguringItem(null);
          }}
        />
      ) : null}
    </div>
  );
}

interface ConfiguratorProps {
  item: WalkInItem;
  onCancel: () => void;
  onAdd: (
    modifiers: { groupName: string; optionName: string; priceMinor: number }[],
    notes: string,
  ) => void;
}

function ItemConfigurator({ item, onCancel, onAdd }: ConfiguratorProps) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggleOption = (groupName: string, optionName: string, max: number): void => {
    setSelections((prev) => {
      const current = prev[groupName] ?? [];
      const exists = current.includes(optionName);
      let next: string[];
      if (exists) {
        next = current.filter((o) => o !== optionName);
      } else if (max === 1) {
        next = [optionName];
      } else if (current.length >= max) {
        return prev;
      } else {
        next = [...current, optionName];
      }
      return { ...prev, [groupName]: next };
    });
  };

  const onConfirm = (): void => {
    setError(null);
    const flat: { groupName: string; optionName: string; priceMinor: number }[] = [];
    for (const group of item.modifiers) {
      const picked = selections[group.name] ?? [];
      if (group.required && picked.length === 0) {
        setError(`Pick an option for ${group.name}.`);
        return;
      }
      for (const optionName of picked) {
        const opt = group.options.find((o) => o.name === optionName);
        if (opt) {
          flat.push({ groupName: group.name, optionName: opt.name, priceMinor: opt.priceMinor });
        }
      }
    }
    onAdd(flat, notes);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background border-border w-full max-w-lg space-y-4 rounded-md border p-5 shadow-xl">
        <header className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">{item.name}</h3>
            <p className="text-muted-foreground text-xs">{item.priceLabel}</p>
          </div>
          <Button
            variant="plain"
            size="none"
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Close
          </Button>
        </header>

        {item.modifiers.map((group) => (
          <fieldset key={group.name} className="space-y-2">
            <legend className="text-sm font-medium">
              {group.name}{' '}
              <span className="text-muted-foreground text-xs">
                {group.required ? 'required' : 'optional'} · pick up to {group.max}
              </span>
            </legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {group.options.map((option) => {
                const checked = (selections[group.name] ?? []).includes(option.name);
                return (
                  <label
                    key={option.name}
                    className={`border-border flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm ${
                      checked ? 'bg-accent' : 'hover:bg-muted/40'
                    }`}
                  >
                    <span>
                      <Input
                        type={group.max === 1 ? 'radio' : 'checkbox'}
                        name={group.name}
                        checked={checked}
                        onChange={() => toggleOption(group.name, option.name, group.max)}
                        className="mr-2 h-3 w-3"
                      />
                      {option.name}
                    </span>
                    <span className="text-muted-foreground text-xs">{option.priceLabel}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Notes</span>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            className="border-border rounded-md border px-3 py-1 text-sm"
            placeholder="No onions, allergy, etc."
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button
            variant="plain"
            size="none"
            type="button"
            onClick={onCancel}
            className="border-border hover:bg-muted inline-flex h-9 items-center rounded-md border px-3 text-sm"
          >
            Cancel
          </Button>
          <Button
            variant="plain"
            size="none"
            type="button"
            onClick={onConfirm}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium"
          >
            Add to order
          </Button>
        </div>
      </div>
    </div>
  );
}
