'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import { channels } from '@menukaze/realtime';
import {
  getSessionMinutesRemaining,
  isSessionExpired,
  isSessionInWarningWindow,
} from '@menukaze/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Eyebrow,
  Input,
  cn,
} from '@menukaze/ui';
import {
  cartItemCount,
  cartLineKey,
  cartSubtotalMinor,
  useRoundCart,
  type CartLine,
} from '@/stores/cart';
import { placeRoundAction, callWaiterAction } from '@/app/actions/session';
import { RoundItemAddButton } from './round-item-add-button';

interface SessionModifierOption {
  name: string;
  priceMinor: number;
  priceLabel: string;
}

interface SessionModifierGroup {
  name: string;
  required: boolean;
  max: number;
  options: SessionModifierOption[];
}

export interface SessionItem {
  id: string;
  name: string;
  description?: string;
  priceMinor: number;
  priceLabel: string;
  categoryId: string;
  categoryName: string;
  soldOut: boolean;
  imageUrl?: string;
  comboItemNames: string[];
  modifiers: SessionModifierGroup[];
}

export interface SessionRound {
  id: string;
  publicOrderId: string;
  status: string;
  totalLabel: string;
  items: Array<{ name: string; quantity: number }>;
}

interface Props {
  restaurantId: string;
  sessionId: string;
  status: 'active' | 'bill_requested' | 'paid' | 'closed' | 'needs_review';
  customerName: string;
  participants: string[];
  menus: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; menuId: string }>;
  items: SessionItem[];
  rounds: SessionRound[];
  totalLabel: string;
  currency: string;
  locale: string;
  lastActivityAt: string;
  sessionTimeoutMinutes: number;
  paymentModeRequested?: 'online' | 'counter';
}

export function SessionClient({
  restaurantId,
  sessionId,
  status,
  customerName,
  participants,
  menus,
  categories,
  items,
  rounds,
  totalLabel,
  currency,
  locale,
  lastActivityAt,
  sessionTimeoutMinutes,
  paymentModeRequested,
}: Props) {
  const router = useRouter();
  const cartLines = useRoundCart((s) => s.lines);
  const incrementLine = useRoundCart((s) => s.incrementLine);
  const decrementLine = useRoundCart((s) => s.decrementLine);
  const setNotes = useRoundCart((s) => s.setNotes);
  const clear = useRoundCart((s) => s.clear);

  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [liveSyncConnected, setLiveSyncConnected] = useState(false);
  const [participantLabel, setParticipantLabel] = useState(customerName);
  const [clock, setClock] = useState(() => new Date());

  const [activeMenuId, setActiveMenuId] = useState<string>(menus[0]?.id ?? '');

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const tokenUrl = `/api/ably/token?sessionId=${encodeURIComponent(sessionId)}`;
    const client = new Ably.Realtime({ authUrl: tokenUrl });
    client.connection.on('connected', () => setLiveSyncConnected(true));
    client.connection.on('failed', () => setLiveSyncConnected(false));
    const channel = client.channels.get(channels.customerSession(restaurantId, sessionId));

    const handler = () => {
      router.refresh();
    };

    void channel.subscribe(handler);
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, router, sessionId]);

  const visibleCategories = useMemo(() => {
    return categories.filter((c) => c.menuId === activeMenuId);
  }, [categories, activeMenuId]);

  const subtotalLabel = useMemo(() => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(cartSubtotalMinor(cartLines) / 100);
  }, [cartLines, currency, locale]);

  const sessionExpired =
    status === 'needs_review' || isSessionExpired(lastActivityAt, sessionTimeoutMinutes, clock);
  const timeoutWarning =
    !sessionExpired &&
    (status === 'active' || status === 'bill_requested') &&
    isSessionInWarningWindow(lastActivityAt, sessionTimeoutMinutes, clock);
  const minutesRemaining = getSessionMinutesRemaining(lastActivityAt, sessionTimeoutMinutes, clock);
  const sessionLocked = status !== 'active' || sessionExpired;

  const statusText =
    status === 'needs_review'
      ? 'Session needs staff assistance.'
      : status === 'bill_requested'
        ? paymentModeRequested === 'counter'
          ? 'Counter payment requested — staff will be right with you.'
          : 'Bill requested. Continue to payment when ready.'
        : 'Shared session is live. Order as many rounds as you like.';

  function placeRound() {
    if (cartLines.length === 0) return;
    setError(null);
    start(async () => {
      const result = await placeRoundAction({
        sessionId,
        lines: cartLines.map<{
          itemId: string;
          quantity: number;
          modifiers: CartLine['modifiers'];
          notes?: string;
        }>((l: CartLine) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          modifiers: l.modifiers,
          ...(l.notes ? { notes: l.notes } : {}),
        })),
        ...(participantLabel.trim() ? { participantLabel: participantLabel.trim() } : {}),
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
      <Card variant="surface" radius="lg" className="overflow-hidden">
        <div className="border-ink-100 dark:border-ink-800 flex items-center gap-3 border-b px-5 py-3 text-xs">
          <span
            className={cn(
              'relative inline-flex size-2 rounded-full',
              liveSyncConnected ? 'bg-jade-500' : 'bg-ink-400 dark:bg-ink-600',
            )}
          >
            {liveSyncConnected ? (
              <span className="bg-jade-500 absolute inset-0 animate-ping rounded-full opacity-50" />
            ) : null}
          </span>
          <span className="text-ink-700 dark:text-ink-300 font-medium">
            {liveSyncConnected ? 'Live sync connected' : 'Connecting…'}
          </span>
          <span className="text-ink-400 dark:text-ink-500 ml-auto text-[11px]">
            Idle timeout {sessionTimeoutMinutes}m
          </span>
        </div>
        <div className="px-5 py-4">
          <p className="text-foreground text-sm font-medium">{statusText}</p>
          {timeoutWarning ? (
            <div className="border-saffron-200 bg-saffron-50 text-saffron-900 dark:border-saffron-500/30 dark:bg-saffron-500/10 dark:text-saffron-200 mt-3 rounded-lg border px-3 py-2 text-xs">
              Session times out in ~{minutesRemaining} minute{minutesRemaining === 1 ? '' : 's'} —
              add something to keep it alive.
            </div>
          ) : null}
          {sessionExpired ? (
            <div className="border-mkrose-200 bg-mkrose-50 text-mkrose-900 dark:border-mkrose-500/30 dark:bg-mkrose-500/10 dark:text-mkrose-200 mt-3 rounded-lg border px-3 py-2 text-xs">
              Payment is still outstanding. A waiter needs to review the table before it can be
              cleared.
            </div>
          ) : null}
        </div>
      </Card>

      {rounds.length > 0 ? (
        <Card variant="surface" radius="lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-serif text-xl">Your table so far</CardTitle>
                <p className="text-ink-500 dark:text-ink-400 text-xs">
                  {rounds.length} round{rounds.length === 1 ? '' : 's'} ordered
                </p>
              </div>
              <span className="mk-nums text-foreground font-serif text-xl font-medium tabular-nums tracking-tight">
                {totalLabel}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="border-ink-200 dark:border-ink-700 relative ml-2 space-y-4 border-l border-dashed pl-5">
              {rounds.map((round, idx) => (
                <li key={round.id} className="relative">
                  <span className="bg-saffron-500 ring-surface dark:ring-ink-900 absolute -left-[25px] mt-1 flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-4">
                    {idx + 1}
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[13px]">
                        <span className="text-foreground font-mono font-medium tracking-tight">
                          {round.publicOrderId}
                        </span>
                        <Badge variant="subtle" size="xs">
                          {round.status.replace(/_/g, ' ')}
                        </Badge>
                      </p>
                      <p className="text-ink-700 dark:text-ink-300 mt-1 text-sm">
                        {round.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                      </p>
                    </div>
                    <span className="mk-nums text-foreground shrink-0 font-mono text-[13px] tabular-nums">
                      {round.totalLabel}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow tone="accent">Order</Eyebrow>
            <h2 className="text-foreground mt-1 font-serif text-2xl font-medium tracking-tight">
              Menu
            </h2>
          </div>
          {menus.length > 1 ? (
            <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Menus">
              {menus.map((menu) => {
                const active = menu.id === activeMenuId;
                return (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => setActiveMenuId(menu.id)}
                    className={cn(
                      'whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950'
                        : 'bg-canvas-200 text-ink-600 hover:bg-canvas-300 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700',
                    )}
                  >
                    {menu.name}
                  </button>
                );
              })}
            </nav>
          ) : null}
        </div>

        <div className="flex flex-col gap-8">
          {visibleCategories.map((category) => {
            const catItems = items.filter((i) => i.categoryId === category.id);
            if (catItems.length === 0) return null;
            return (
              <div key={category.id}>
                <h3 className="border-ink-100 text-foreground dark:border-ink-800 border-b pb-3 font-serif text-lg font-medium tracking-tight">
                  {category.name}
                </h3>
                <ul className="divide-ink-100 dark:divide-ink-800 divide-y">
                  {catItems.map((item) => (
                    <li
                      key={item.id}
                      className={cn(
                        'flex items-start justify-between gap-4 py-4',
                        item.soldOut && 'opacity-60',
                      )}
                    >
                      <div className="flex min-w-0 flex-1 gap-3">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="ring-ink-100 dark:ring-ink-800 size-16 shrink-0 rounded-xl object-cover ring-1"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-foreground font-serif text-[15px] font-medium leading-tight">
                              {item.name}
                            </p>
                          </div>
                          {item.description ? (
                            <p className="text-ink-500 dark:text-ink-400 mt-1 line-clamp-2 text-[12.5px] leading-relaxed">
                              {item.description}
                            </p>
                          ) : null}
                          {item.comboItemNames.length > 0 ? (
                            <p className="text-ink-500 dark:text-ink-400 mt-1 text-[11px] italic">
                              Includes {item.comboItemNames.join(' · ')}
                            </p>
                          ) : null}
                          {item.soldOut ? (
                            <Badge variant="danger" size="xs" shape="pill" className="mt-2">
                              Sold out
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="mk-nums text-foreground font-mono text-[13px] font-medium tabular-nums">
                          {item.priceLabel}
                        </span>
                        <RoundItemAddButton
                          itemId={item.id}
                          name={item.name}
                          priceMinor={item.priceMinor}
                          currency={currency}
                          locale={locale}
                          modifiers={item.modifiers}
                          disabled={item.soldOut || sessionLocked}
                        />
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
        <Card
          variant="elevated"
          radius="lg"
          className="border-ink-200 sticky bottom-4 z-10 shadow-[0_24px_60px_-12px_oklch(0.14_0.016_90/0.25)] backdrop-blur-md"
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Eyebrow tone="accent">This round</Eyebrow>
                <p className="mt-1 font-serif text-lg font-medium">
                  {cartItemCount(cartLines)} item{cartItemCount(cartLines) === 1 ? '' : 's'}
                </p>
              </div>
              <span className="mk-nums text-foreground font-serif text-2xl font-medium tabular-nums tracking-tight">
                {subtotalLabel}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-ink-500 dark:text-ink-400 text-[11px] font-medium uppercase tracking-[0.14em]">
                Who is this round for?
              </label>
              <Input
                type="text"
                list={`participants-${sessionId}`}
                value={participantLabel}
                onChange={(e) => setParticipantLabel(e.target.value)}
                maxLength={60}
                className="h-9 text-sm"
              />
              <datalist id={`participants-${sessionId}`}>
                {[customerName, ...participants]
                  .filter((value, index, all) => all.indexOf(value) === index)
                  .map((participant) => (
                    <option key={participant} value={participant} />
                  ))}
              </datalist>
            </div>

            <ul className="space-y-2">
              {cartLines.map((line) => {
                const key = cartLineKey(line);
                return (
                  <li
                    key={key}
                    className="border-ink-100 bg-canvas-50/70 dark:border-ink-800 dark:bg-ink-900/60 rounded-xl border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate text-[13px] font-medium">
                          {line.name}
                        </p>
                        {line.modifiers.length > 0 ? (
                          <p className="text-ink-500 dark:text-ink-400 text-[11px]">
                            {line.modifiers.map((m) => m.optionName).join(', ')}
                          </p>
                        ) : null}
                      </div>
                      <div className="border-ink-200 bg-surface dark:border-ink-700 dark:bg-ink-800 inline-flex items-center rounded-full border p-0.5">
                        <button
                          type="button"
                          onClick={() => decrementLine(key)}
                          className="text-ink-600 hover:bg-canvas-100 dark:text-ink-300 dark:hover:bg-ink-700 flex size-6 items-center justify-center rounded-full transition-colors"
                          aria-label="Decrease"
                        >
                          −
                        </button>
                        <span className="mk-nums w-5 text-center text-xs font-medium tabular-nums">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => incrementLine(key)}
                          className="text-ink-600 hover:bg-canvas-100 dark:text-ink-300 dark:hover:bg-ink-700 flex size-6 items-center justify-center rounded-full transition-colors"
                          aria-label="Increase"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <Input
                      type="text"
                      value={line.notes ?? ''}
                      onChange={(e) => setNotes(key, e.target.value)}
                      placeholder="Add a note (no nuts, extra sauce…)"
                      maxLength={200}
                      className="mt-2 h-8 text-xs"
                    />
                  </li>
                );
              })}
            </ul>

            <Button
              type="button"
              size="lg"
              variant="accent"
              full
              loading={isPending}
              disabled={isPending}
              onClick={placeRound}
            >
              {isPending ? 'Placing round' : `Place round · ${subtotalLabel}`}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={waiterCalled ? 'accent' : 'outline'}
          size="md"
          onClick={callWaiter}
          disabled={isPending || sessionLocked}
        >
          {waiterCalled ? (
            <>
              <CheckIcon /> Waiter on the way
            </>
          ) : (
            <>
              <BellIcon /> Call waiter
            </>
          )}
        </Button>
        {rounds.length > 0 && (status === 'active' || status === 'bill_requested') ? (
          <Link href={`/session/${sessionId}/bill`} className="ml-auto">
            <Button variant="primary" size="md">
              {status === 'bill_requested' ? 'Continue to payment' : 'Request bill'}
              <ArrowIcon />
            </Button>
          </Link>
        ) : null}
      </div>

      {error ? (
        <div className="border-mkrose-200 bg-mkrose-50 text-mkrose-800 dark:border-mkrose-500/30 dark:bg-mkrose-500/10 dark:text-mkrose-300 rounded-lg border px-3 py-2.5 text-sm font-medium">
          {error}
        </div>
      ) : null}
    </>
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
function BellIcon() {
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
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
