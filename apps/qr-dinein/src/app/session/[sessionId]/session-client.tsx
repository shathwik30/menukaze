'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import { channels } from '@menukaze/realtime';
import {
  getSessionMinutesRemaining,
  isSessionExpired,
  isSessionInWarningWindow,
} from '@menukaze/shared';
import { Input, cn } from '@menukaze/ui';
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
  min: number;
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
  allergens: string[];
  featured: boolean;
  searchKeywords: string[];
  taxClassId?: string;
  variants: Array<{
    id: string;
    name: string;
    priceMinor: number;
    priceLabel: string;
    isDefault: boolean;
    soldOut: boolean;
  }>;
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
  categories: Array<{
    id: string;
    name: string;
    description?: string;
    menuId: string;
    menuIds: string[];
  }>;
  items: SessionItem[];
  rounds: SessionRound[];
  totalLabel: string;
  currency: string;
  locale: string;
  lastActivityAt: string;
  sessionTimeoutMinutes: number;
  paymentModeRequested?: 'online' | 'counter';
}

function roundStatusLabel(s: string): string {
  return (
    {
      received: 'Received',
      confirmed: 'Confirmed',
      preparing: 'Preparing',
      ready: 'Ready',
      out_for_delivery: 'On its way',
      completed: 'Served',
    }[s] ?? s.replace(/_/g, ' ')
  );
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
  const [activeCategoryId, setActiveCategoryId] = useState<string>(categories[0]?.id ?? '');
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [roundsExpanded, setRoundsExpanded] = useState(false);

  const categoryNavRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) sectionRefs.current.set(id, el);
      else sectionRefs.current.delete(id);
    },
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Ably realtime
  useEffect(() => {
    const tokenUrl = `/api/ably/token?sessionId=${encodeURIComponent(sessionId)}`;
    const client = new Ably.Realtime({ authUrl: tokenUrl });
    client.connection.on('connected', () => setLiveSyncConnected(true));
    client.connection.on('failed', () => setLiveSyncConnected(false));
    const channel = client.channels.get(channels.customerSession(restaurantId, sessionId));
    const handler = () => router.refresh();
    void channel.subscribe(handler);
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, router, sessionId]);

  const visibleCategories = useMemo(() => {
    return categories.filter((category) =>
      category.menuIds.includes(activeMenuId || category.menuId),
    );
  }, [categories, activeMenuId]);

  // Scroll-spy: highlight category pill when section is in view
  useEffect(() => {
    if (visibleCategories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) {
          const id = first.target.getAttribute('data-category-id');
          if (id) setActiveCategoryId(id);
        }
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [visibleCategories]);

  // Keep active pill scrolled into view in the pill nav
  useEffect(() => {
    if (!categoryNavRef.current || !activeCategoryId) return;
    const pill = categoryNavRef.current.querySelector<HTMLElement>(
      `[data-pill="${activeCategoryId}"]`,
    );
    if (pill) pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeCategoryId]);

  function scrollToCategory(categoryId: string) {
    const el = sectionRefs.current.get(categoryId);
    if (!el) return;
    const STICKY_HEIGHT = 112; // header + category nav
    const y = el.getBoundingClientRect().top + window.scrollY - STICKY_HEIGHT;
    window.scrollTo({ top: y, behavior: 'smooth' });
    setActiveCategoryId(categoryId);
  }

  const subtotalMinor = cartSubtotalMinor(cartLines);
  const subtotalLabel = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(subtotalMinor / 100),
    [cartLines, currency, locale],
  );

  const sessionExpired =
    status === 'needs_review' || isSessionExpired(lastActivityAt, sessionTimeoutMinutes, clock);
  const timeoutWarning =
    !sessionExpired &&
    (status === 'active' || status === 'bill_requested') &&
    isSessionInWarningWindow(lastActivityAt, sessionTimeoutMinutes, clock);
  const minutesRemaining = getSessionMinutesRemaining(lastActivityAt, sessionTimeoutMinutes, clock);
  const sessionLocked = status !== 'active' || sessionExpired;
  const itemCount = cartItemCount(cartLines);
  const cartVisible = itemCount > 0 && !sessionLocked;
  // Request bill only shown when every non-cancelled round has been served
  const allRoundsServed =
    rounds.length > 0 &&
    rounds
      .filter((r) => r.status !== 'cancelled')
      .every((r) => r.status === 'served' || r.status === 'completed');

  // Clear cart immediately when session becomes locked so a stale cart bar
  // can never linger or submit an order.
  useEffect(() => {
    if (sessionLocked) {
      clear();
      setCartSheetOpen(false);
    }
  }, [sessionLocked]);

  function placeRound() {
    if (cartLines.length === 0) return;
    setError(null);
    start(async () => {
      const result = await placeRoundAction({
        sessionId,
        lines: cartLines.map<{
          itemId: string;
          variantId?: string;
          quantity: number;
          modifiers: CartLine['modifiers'];
          notes?: string;
        }>((l: CartLine) => ({
          itemId: l.itemId,
          ...(l.variantId ? { variantId: l.variantId } : {}),
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
      setCartSheetOpen(false);
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
      {/* ── Past rounds — shown above the sticky nav so they land first ── */}
      {rounds.length > 0 ? (
        <div className="border-ink-100 -mx-4 border-b bg-white sm:-mx-6">
          <button
            type="button"
            onClick={() => setRoundsExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 sm:px-6"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-ink-950 text-sm font-semibold">
                {rounds.length} round{rounds.length > 1 ? 's' : ''} ordered
              </span>
              <span className="bg-jade-100 text-jade-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                {totalLabel}
              </span>
            </div>
            <ChevronIcon open={roundsExpanded} />
          </button>

          {roundsExpanded ? (
            <div className="divide-ink-50 border-ink-100 divide-y border-t px-4 pb-3 sm:px-6">
              {rounds.map((round, idx) => (
                <div key={round.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-saffron-100 text-saffron-700 flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          round.status === 'completed' ||
                            round.status === 'ready' ||
                            round.status === 'served'
                            ? 'bg-jade-100 text-jade-700'
                            : round.status === 'preparing'
                              ? 'bg-saffron-100 text-saffron-700'
                              : 'bg-canvas-100 text-ink-500',
                        )}
                      >
                        {roundStatusLabel(round.status)}
                      </span>
                    </div>
                    <span className="text-ink-600 font-mono text-xs">{round.totalLabel}</span>
                  </div>
                  <p className="text-ink-500 mt-1.5 pl-7 text-xs leading-relaxed">
                    {round.items.map((i) => `${i.quantity}× ${i.name}`).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Sticky category nav ──────────────────────────────────────── */}
      <div className="border-ink-100 sticky top-[57px] z-20 -mx-4 border-b bg-white/95 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
        {menus.length > 1 ? (
          <div className="scrollbar-none flex gap-1 overflow-x-auto border-b pt-2 pb-0">
            {menus.map((menu) => (
              <button
                key={menu.id}
                type="button"
                onClick={() => {
                  setActiveMenuId(menu.id);
                  const firstCat = categories.find((category) =>
                    category.menuIds.includes(menu.id),
                  );
                  if (firstCat) setActiveCategoryId(firstCat.id);
                }}
                className={cn(
                  'shrink-0 rounded-t-md px-3 pt-2 pb-2.5 text-xs font-semibold transition-colors',
                  menu.id === activeMenuId
                    ? 'border-ink-950 text-ink-950 -mb-px border-b-2'
                    : 'text-ink-400 hover:text-ink-700',
                )}
              >
                {menu.name}
              </button>
            ))}
          </div>
        ) : null}
        <div ref={categoryNavRef} className="scrollbar-none flex gap-1.5 overflow-x-auto py-2.5">
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              data-pill={cat.id}
              type="button"
              onClick={() => scrollToCategory(cat.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors',
                cat.id === activeCategoryId
                  ? 'bg-ink-950 text-white'
                  : 'bg-canvas-100 text-ink-500 hover:bg-canvas-200 hover:text-ink-800',
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-5 pt-3 pb-28">
        {/* ── Session status ────────────────────────────────────────────── */}
        {status !== 'active' || sessionExpired || timeoutWarning ? (
          <div
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-medium',
              sessionExpired
                ? 'bg-mkrose-50 text-mkrose-700'
                : status === 'bill_requested'
                  ? 'bg-lapis-50 text-lapis-700'
                  : 'bg-saffron-50 text-saffron-800',
            )}
          >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                sessionExpired
                  ? 'bg-mkrose-500'
                  : status === 'bill_requested'
                    ? 'bg-lapis-500'
                    : 'bg-saffron-500',
              )}
            />
            {sessionExpired && status === 'needs_review'
              ? 'Payment needs staff review. A waiter is on their way.'
              : status === 'bill_requested'
                ? paymentModeRequested === 'counter'
                  ? 'Staff will settle your bill at the table.'
                  : 'Bill requested — continue to payment when ready.'
                : timeoutWarning
                  ? `Session expires in ~${minutesRemaining} min — add something to keep it active.`
                  : 'Session expired. Staff assistance required.'}
          </div>
        ) : null}

        {/* ── Ordering-closed notice (bill requested / needs review) ────── */}
        {sessionLocked && status !== 'active' ? (
          <div className="border-ink-100 bg-canvas-50 flex items-center gap-3 rounded-xl border px-4 py-3.5">
            <LockIcon className="text-ink-400 size-4 shrink-0" />
            <p className="text-ink-600 text-sm">
              {status === 'needs_review'
                ? 'This session needs staff assistance before anything else can be ordered.'
                : 'Ordering is closed — your bill has been requested.'}
            </p>
          </div>
        ) : null}

        {/* ── Menu sections ────────────────────────────────────────────── */}
        {visibleCategories.map((category) => {
          const catItems = items.filter((i) => i.categoryId === category.id);
          if (catItems.length === 0) return null;
          return (
            <section key={category.id} ref={setRef(category.id)} data-category-id={category.id}>
              <h2 className="text-ink-950 mb-3 font-serif text-lg font-medium tracking-tight">
                {category.name}
              </h2>
              <div className="border-ink-100 divide-ink-50 divide-y overflow-hidden rounded-2xl border bg-white">
                {catItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    currency={currency}
                    locale={locale}
                    disabled={item.soldOut || sessionLocked}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* Live sync indicator */}
        <div className="flex items-center justify-center gap-1.5 pb-2">
          <span
            className={cn(
              'relative size-1.5 rounded-full',
              liveSyncConnected ? 'bg-jade-500' : 'bg-ink-300',
            )}
          >
            {liveSyncConnected ? (
              <span className="bg-jade-400 absolute inset-0 animate-ping rounded-full opacity-60" />
            ) : null}
          </span>
          <span className="text-ink-400 text-[10px]">
            {liveSyncConnected ? 'Live updates on' : 'Connecting…'}
          </span>
        </div>
      </div>

      {/* ── Sticky cart bar (centre) ──────────────────────────────────────── */}
      {cartVisible ? (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pt-2 pb-6 sm:px-6">
          <button
            type="button"
            onClick={() => setCartSheetOpen(true)}
            className="bg-ink-950 shadow-ink-950/30 flex w-full items-center justify-between rounded-2xl px-5 py-4 shadow-2xl transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <span className="bg-saffron-500 flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white">
                {itemCount}
              </span>
              <span className="text-sm font-semibold text-white">View order</span>
            </div>
            <span className="font-mono text-sm font-semibold text-white">{subtotalLabel}</span>
          </button>
        </div>
      ) : null}

      {/* ── Floating corner FABs ─────────────────────────────────────────────
          Bottom-left  = Call waiter (active session only)
          Bottom-right = Request bill (all rounds served) or Continue to payment
      ──────────────────────────────────────────────────────────────────────── */}

      {/* Call waiter — bottom left */}
      {status === 'active' && !sessionExpired ? (
        <button
          type="button"
          onClick={callWaiter}
          disabled={isPending}
          className={cn(
            'fixed z-30 flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold shadow-lg transition-all active:scale-95',
            cartVisible ? 'bottom-[88px] left-4 sm:left-6' : 'bottom-6 left-4 sm:left-6',
            waiterCalled
              ? 'border-jade-200 bg-jade-50 text-jade-700 shadow-jade-100'
              : 'border-ink-200 text-ink-700 shadow-ink-950/10 bg-white',
          )}
        >
          {waiterCalled ? (
            <>
              <CheckIcon className="size-3.5" />
              On the way
            </>
          ) : (
            <>
              <BellIcon className="size-3.5" />
              Call waiter
            </>
          )}
        </button>
      ) : null}

      {/* Request bill — bottom right (only when all rounds served) */}
      {allRoundsServed && status === 'active' ? (
        <Link
          href={`/session/${sessionId}/bill`}
          className={cn(
            'bg-ink-950 shadow-ink-950/25 fixed z-30 flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-all active:scale-95',
            cartVisible ? 'right-4 bottom-[88px] sm:right-6' : 'right-4 bottom-6 sm:right-6',
          )}
        >
          Request bill
          <span className="text-ink-400 font-mono text-[10px]">{totalLabel}</span>
        </Link>
      ) : status === 'bill_requested' ? (
        <Link
          href={`/session/${sessionId}/bill`}
          className="bg-lapis-600 shadow-lapis-600/25 fixed right-4 bottom-6 z-30 flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-all active:scale-95 sm:right-6"
        >
          Continue to payment
        </Link>
      ) : null}

      {/* ── Cart bottom sheet ─────────────────────────────────────────────── */}
      {cartSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close cart"
            onClick={() => setCartSheetOpen(false)}
            className="bg-ink-950/50 absolute inset-0 backdrop-blur-sm"
            tabIndex={-1}
          />

          {/* Sheet */}
          <div className="relative w-full rounded-t-3xl bg-white shadow-2xl">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="bg-ink-200 h-1 w-10 rounded-full" />
            </div>

            <div className="px-5 pt-1 pb-3">
              <h3 className="text-ink-950 font-serif text-xl font-medium">This round</h3>
            </div>

            {/* Cart items */}
            <div className="max-h-[45vh] overflow-y-auto px-5">
              <div className="flex flex-col gap-2 pb-3">
                {cartLines.map((line) => {
                  const key = cartLineKey(line);
                  return (
                    <div
                      key={key}
                      className="bg-canvas-50 flex items-center gap-3 rounded-xl px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-ink-950 truncate text-sm font-medium">{line.name}</p>
                        {line.variantName ? (
                          <p className="text-ink-400 text-[11px]">{line.variantName}</p>
                        ) : null}
                        {line.modifiers.length > 0 ? (
                          <p className="text-ink-400 text-[11px]">
                            {line.modifiers.map((m) => m.optionName).join(', ')}
                          </p>
                        ) : null}
                        <Input
                          type="text"
                          value={line.notes ?? ''}
                          onChange={(e) => setNotes(key, e.target.value)}
                          placeholder="Note (no nuts, extra sauce…)"
                          maxLength={200}
                          className="ring-ink-100 mt-1.5 h-7 border-0 bg-white px-2 text-[11px] shadow-none ring-1"
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => decrementLine(key)}
                          className="border-ink-200 text-ink-700 active:bg-canvas-100 flex size-7 items-center justify-center rounded-full border bg-white transition-colors"
                          aria-label="Remove one"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold tabular-nums">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => incrementLine(key)}
                          className="bg-ink-950 flex size-7 items-center justify-center rounded-full text-white transition-opacity active:opacity-80"
                          aria-label="Add one"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Participant field */}
            <div className="border-ink-100 mx-5 border-t pt-3">
              <label className="text-ink-400 mb-1.5 block text-[11px] font-semibold tracking-[0.12em] uppercase">
                Who is this round for?
              </label>
              <Input
                type="text"
                list={`participants-${sessionId}`}
                value={participantLabel}
                onChange={(e) => setParticipantLabel(e.target.value)}
                maxLength={60}
                className="h-9"
              />
              <datalist id={`participants-${sessionId}`}>
                {[customerName, ...participants]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((p) => (
                    <option key={p} value={p} />
                  ))}
              </datalist>
            </div>

            {/* Error */}
            {error ? (
              <p className="text-mkrose-600 mx-5 mt-2 text-xs font-medium">{error}</p>
            ) : null}

            {/* Place order */}
            <div className="px-5 pt-3 pb-8">
              <button
                type="button"
                onClick={placeRound}
                disabled={isPending}
                className="bg-saffron-500 hover:bg-saffron-600 flex w-full items-center justify-between rounded-2xl px-5 py-4 font-semibold text-white transition-colors disabled:opacity-60"
              >
                <span>{isPending ? 'Placing…' : 'Place order'}</span>
                <span className="font-mono">{subtotalLabel}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  currency,
  locale,
  disabled,
}: {
  item: SessionItem;
  currency: string;
  locale: string;
  disabled: boolean;
}) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-4', item.soldOut && 'opacity-50')}>
      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-ink-950 font-serif text-[15px] leading-tight font-medium">{item.name}</p>
        {item.description ? (
          <p className="text-ink-400 mt-1 line-clamp-2 text-xs leading-relaxed">
            {item.description}
          </p>
        ) : null}
        {item.comboItemNames.length > 0 ? (
          <p className="text-ink-400 mt-0.5 text-[10px] italic">
            Includes {item.comboItemNames.join(' · ')}
          </p>
        ) : null}
        {item.allergens.length > 0 ? (
          <p className="text-ink-400 mt-0.5 text-[10px]">Allergens: {item.allergens.join(', ')}</p>
        ) : null}
        <div className="mt-2.5 flex items-center gap-3">
          <span className="text-ink-950 font-mono text-sm font-semibold">{item.priceLabel}</span>
          {item.featured ? (
            <span className="bg-saffron-100 text-saffron-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">
              Featured
            </span>
          ) : null}
          {item.soldOut ? (
            <span className="bg-canvas-100 text-ink-400 rounded-full px-2 py-0.5 text-[10px] font-semibold">
              Sold out
            </span>
          ) : null}
        </div>
      </div>

      {/* Right: image + add button */}
      <div className="flex shrink-0 flex-col items-center gap-2">
        {item.imageUrl ? (
          <div className="relative">
            <img src={item.imageUrl} alt={item.name} className="size-20 rounded-xl object-cover" />
            {!disabled ? (
              <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2">
                <RoundItemAddButton
                  itemId={item.id}
                  name={item.name}
                  priceMinor={item.priceMinor}
                  taxClassId={item.taxClassId}
                  currency={currency}
                  locale={locale}
                  variants={item.variants}
                  modifiers={item.modifiers}
                  disabled={disabled}
                  compact
                />
              </div>
            ) : null}
          </div>
        ) : !disabled ? (
          <RoundItemAddButton
            itemId={item.id}
            name={item.name}
            priceMinor={item.priceMinor}
            taxClassId={item.taxClassId}
            currency={currency}
            locale={locale}
            variants={item.variants}
            modifiers={item.modifiers}
            disabled={disabled}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Small icons ────────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('text-ink-400 size-4 transition-transform', open && 'rotate-180')}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
