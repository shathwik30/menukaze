'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useRoundCart, subtotalMinor, itemCount, type CartLine } from '@/stores/cart';
import { placeRoundAction, callWaiterAction } from '@/app/actions/session';

export interface SessionItem {
  id: string;
  name: string;
  description?: string;
  priceMinor: number;
  priceLabel: string;
  categoryId: string;
  categoryName: string;
  soldOut: boolean;
}

export interface SessionRound {
  id: string;
  publicOrderId: string;
  status: string;
  totalLabel: string;
  items: Array<{ name: string; quantity: number }>;
}

interface Props {
  sessionId: string;
  status: 'active' | 'bill_requested' | 'paid' | 'closed' | 'needs_review';
  menus: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; menuId: string }>;
  items: SessionItem[];
  rounds: SessionRound[];
  totalLabel: string;
  currency: string;
  locale: string;
}

export function SessionClient({
  sessionId,
  status,
  menus,
  categories,
  items,
  rounds,
  totalLabel,
  currency,
  locale,
}: Props) {
  const router = useRouter();
  const cartLines = useRoundCart((s) => s.lines);
  const add = useRoundCart((s) => s.add);
  const inc = useRoundCart((s) => s.inc);
  const dec = useRoundCart((s) => s.dec);
  const setNotes = useRoundCart((s) => s.setNotes);
  const clear = useRoundCart((s) => s.clear);

  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [waiterCalled, setWaiterCalled] = useState(false);

  const [activeMenuId, setActiveMenuId] = useState<string>(menus[0]?.id ?? '');

  const visibleCategories = useMemo(() => {
    return categories.filter((c) => c.menuId === activeMenuId);
  }, [categories, activeMenuId]);

  const subtotalLabel = useMemo(() => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(subtotalMinor(cartLines) / 100);
  }, [cartLines, currency, locale]);

  const sessionLocked = status !== 'active';

  function placeRound() {
    if (cartLines.length === 0) return;
    setError(null);
    start(async () => {
      const result = await placeRoundAction({
        sessionId,
        lines: cartLines.map<{
          itemId: string;
          quantity: number;
          modifiers: never[];
          notes?: string;
        }>((l: CartLine) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          modifiers: [],
          ...(l.notes ? { notes: l.notes } : {}),
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      clear();
      router.refresh();
    });
  }

  function callWaiter() {
    start(async () => {
      const result = await callWaiterAction(sessionId);
      if (result.ok) {
        setWaiterCalled(true);
        window.setTimeout(() => setWaiterCalled(false), 3000);
      }
    });
  }

  return (
    <>
      {rounds.length > 0 ? (
        <section className="border-border rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Your rounds</h2>
            <span className="text-foreground font-mono text-sm font-semibold">{totalLabel}</span>
          </div>
          <ul className="mt-3 space-y-3 text-sm">
            {rounds.map((round) => (
              <li
                key={round.id}
                className="border-border flex items-start justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-foreground font-mono text-xs">
                    {round.publicOrderId}{' '}
                    <span className="text-muted-foreground ml-1">· {round.status}</span>
                  </p>
                  <p className="text-foreground mt-1">
                    {round.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                  </p>
                </div>
                <span className="text-foreground shrink-0 font-mono text-xs">
                  {round.totalLabel}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-border rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Menu</h2>
          {menus.length > 1 ? (
            <nav className="flex gap-1 text-xs">
              {menus.map((menu) => (
                <button
                  key={menu.id}
                  type="button"
                  onClick={() => setActiveMenuId(menu.id)}
                  className={
                    menu.id === activeMenuId
                      ? 'bg-foreground text-background rounded-full px-3 py-1'
                      : 'text-muted-foreground border-input rounded-full border px-3 py-1'
                  }
                >
                  {menu.name}
                </button>
              ))}
            </nav>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-6">
          {visibleCategories.map((category) => {
            const catItems = items.filter((i) => i.categoryId === category.id);
            if (catItems.length === 0) return null;
            return (
              <div key={category.id}>
                <h3 className="text-foreground text-sm font-semibold">{category.name}</h3>
                <ul className="divide-border mt-2 divide-y">
                  {catItems.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-foreground font-medium">
                          {item.name}
                          {item.soldOut ? (
                            <span className="text-muted-foreground ml-2 text-xs uppercase">
                              sold out
                            </span>
                          ) : null}
                        </p>
                        {item.description ? (
                          <p className="text-muted-foreground text-xs">{item.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-foreground font-mono text-sm">{item.priceLabel}</span>
                        {item.soldOut || sessionLocked ? null : (
                          <button
                            type="button"
                            onClick={() =>
                              add({
                                itemId: item.id,
                                name: item.name,
                                priceMinor: item.priceMinor,
                              })
                            }
                            className="border-input rounded-md border px-2 py-1 text-xs"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {cartLines.length > 0 && !sessionLocked ? (
        <section className="border-border bg-background sticky bottom-3 rounded-lg border p-4 shadow-lg">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">This round</p>
          <ul className="mt-2 space-y-3 text-sm">
            {cartLines.map((line) => (
              <li key={line.itemId} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{line.name}</span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => dec(line.itemId)}
                      className="border-input h-6 w-6 rounded-md border text-xs"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-xs">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => inc(line.itemId)}
                      className="border-input h-6 w-6 rounded-md border text-xs"
                    >
                      +
                    </button>
                  </span>
                </div>
                <input
                  type="text"
                  value={line.notes ?? ''}
                  onChange={(e) => setNotes(line.itemId, e.target.value)}
                  placeholder="Special instructions (optional)"
                  maxLength={200}
                  className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                />
              </li>
            ))}
          </ul>
          <div className="border-border mt-3 flex items-center justify-between border-t pt-3 text-sm">
            <span className="font-semibold">{itemCount(cartLines)} items</span>
            <span className="font-mono font-semibold">{subtotalLabel}</span>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={placeRound}
            className="bg-primary text-primary-foreground mt-3 h-10 w-full rounded-md text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? 'Placing…' : 'Place this round'}
          </button>
        </section>
      ) : null}

      <section className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-4">
        <button
          type="button"
          onClick={callWaiter}
          disabled={isPending || sessionLocked}
          className="border-input rounded-md border px-3 py-2 text-xs disabled:opacity-50"
        >
          {waiterCalled ? 'Waiter on the way ✓' : 'Call waiter'}
        </button>
        {rounds.length > 0 ? (
          <Link
            href={`/session/${sessionId}/bill`}
            className="bg-primary text-primary-foreground ml-auto inline-flex h-9 items-center rounded-md px-4 text-xs font-semibold"
          >
            {status === 'bill_requested' ? 'Continue to payment →' : 'Request bill →'}
          </Link>
        ) : null}
      </section>

      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}
    </>
  );
}
