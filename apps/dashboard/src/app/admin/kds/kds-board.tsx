'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import {
  channels,
  isOrderCreatedEvent,
  isOrderStatusChangedEvent,
  type OrderStatus,
} from '@menukaze/realtime';
import { formatPickupNumber } from '@menukaze/shared';
import { Badge, type BadgeProps, Button, Checkbox, cn, EmptyState, Kbd } from '@menukaze/ui';
import { updateOrderStatusAction } from '@/app/actions/orders';
import { advanceOrderLinesAction } from '@/app/actions/stations';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface KdsLine {
  id: string;
  quantity: number;
  name: string;
  modifiers: string[];
  notes?: string;
  stationId: string | null;
  stationName: string | null;
  lineStatus: 'received' | 'preparing' | 'ready';
}

export interface KdsStation {
  id: string;
  name: string;
  color: string | null;
}

export interface KdsCard {
  id: string;
  publicOrderId: string;
  pickupNumber?: number;
  channel: string;
  type: string;
  status: OrderStatus;
  createdAt: string;
  items: KdsLine[];
  tableId?: string;
  tableNumber?: number;
  suspicious?: boolean;
  suspiciousReason?: string;
}

interface Props {
  restaurantId: string;
  initialCards: KdsCard[];
  stationFilter?: string | null;
}

const CHANNEL_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  storefront: 'info',
  qr_dinein: 'success',
  kiosk: 'warning',
  walk_in: 'subtle',
  api: 'accent',
};

const STAGE_ACTIONS: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  received: { next: 'confirmed', label: 'Confirm' },
  confirmed: { next: 'preparing', label: 'Start prepping' },
  preparing: { next: 'ready', label: 'Mark ready' },
  ready: { next: 'completed', label: 'Complete' },
};

// Ticket age thresholds in minutes that drive the Hot / Late accents.
const AGE_HOT_MIN = 5;
const AGE_LATE_MIN = 10;

type AgeSeverity = 'ok' | 'hot' | 'late';

function ageSeverity(ageMinutes: number): AgeSeverity {
  if (ageMinutes >= AGE_LATE_MIN) return 'late';
  if (ageMinutes >= AGE_HOT_MIN) return 'hot';
  return 'ok';
}

function useNewOrderChime(enabled: boolean): () => void {
  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  return useCallback(() => {
    if (!enabledRef.current || typeof window === 'undefined') return;
    const AudioContextCtor: typeof AudioContext | undefined =
      window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) return;
    ctxRef.current ??= new AudioContextCtor();
    const ctx = ctxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }, []);
}

const CHANNEL_FILTERS: Array<{
  id: 'all' | 'storefront' | 'qr_dinein' | 'kiosk' | 'walk_in' | 'api';
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'storefront', label: 'Storefront' },
  { id: 'qr_dinein', label: 'QR dine-in' },
  { id: 'kiosk', label: 'Kiosk' },
  { id: 'walk_in', label: 'Walk-in' },
  { id: 'api', label: 'API' },
];

type ChannelFilter = (typeof CHANNEL_FILTERS)[number]['id'];

export function KdsBoard({ restaurantId, initialCards, stationFilter }: Props) {
  const router = useRouter();
  const [cards, setCards] = useState<KdsCard[]>(initialCards);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [isPending, start] = useTransition();
  const chime = useNewOrderChime(soundEnabled);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  useEffect(() => {
    setCards(initialCards);
  }, [initialCards]);

  useEffect(() => {
    const client = new Ably.Realtime({ authUrl: '/api/ably/token' });
    const channel = client.channels.get(channels.orders(restaurantId));

    const handler = (msg: Ably.Message) => {
      if (msg.name === 'order.created' && isOrderCreatedEvent(msg.data)) {
        chime();
        router.refresh();
      } else if (msg.name === 'order.status_changed' && isOrderStatusChangedEvent(msg.data)) {
        const data = msg.data;
        const status = data.status;
        setCards((prev) => {
          if (status === 'completed' || status === 'cancelled' || status === 'served') {
            return prev.filter((c) => c.id !== data.orderId);
          }
          return prev.map((c) => (c.id === data.orderId ? { ...c, status } : c));
        });
      }
    };
    void channel.subscribe(handler);
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, router, chime]);

  // `S` toggles sound; skipped while the user is in an editable field.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 's' && event.key !== 'S') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setSoundEnabled((v) => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const grouped = useMemo(() => {
    const buckets: Record<'received' | 'preparing' | 'ready', KdsCard[]> = {
      received: [],
      preparing: [],
      ready: [],
    };
    for (const card of cards) {
      if (channelFilter !== 'all' && card.channel !== channelFilter) continue;
      if (card.status === 'received' || card.status === 'confirmed') {
        buckets.received.push(card);
      } else if (card.status === 'preparing') {
        buckets.preparing.push(card);
      } else if (card.status === 'ready') {
        buckets.ready.push(card);
      }
    }
    return buckets;
  }, [cards, channelFilter]);

  function advance(card: KdsCard): void {
    const action = STAGE_ACTIONS[card.status];
    if (!action) return;
    start(async () => {
      const result = await updateOrderStatusAction({
        orderId: card.id,
        nextStatus: action.next,
      });
      if (!result.ok) return;
      setCards((prev) => {
        if (result.status === 'completed') {
          return prev.filter((c) => c.id !== card.id);
        }
        return prev.map((c) => (c.id === card.id ? { ...c, status: result.status } : c));
      });
    });
  }

  function advanceLines(card: KdsCard, next: 'preparing' | 'ready'): void {
    const lineIds = card.items.map((line) => line.id).filter((id) => id.length > 0);
    if (lineIds.length === 0) return;
    start(async () => {
      const result = await advanceOrderLinesAction({ orderId: card.id, lineIds, next });
      if (!result.ok) return;
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="border-ink-100 bg-surface dark:border-ink-800 dark:bg-ink-900 flex flex-wrap items-center gap-4 rounded-2xl border px-4 py-3">
        <label className="text-ink-700 dark:text-ink-300 inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
          <span
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              soundEnabled ? 'bg-saffron-500' : 'bg-ink-200 dark:bg-ink-700',
            )}
          >
            <span
              className={cn(
                'inline-block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform',
                soundEnabled && 'translate-x-4',
              )}
            />
            <Checkbox
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="sr-only"
            />
          </span>
          Sound alerts
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {CHANNEL_FILTERS.map((f) => {
            const active = channelFilter === f.id;
            return (
              <Button
                variant="plain"
                size="none"
                key={f.id}
                type="button"
                onClick={() => setChannelFilter(f.id)}
                className={cn(
                  'inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium transition-colors',
                  active
                    ? 'bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950'
                    : 'bg-canvas-100 text-ink-600 hover:bg-canvas-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700',
                )}
              >
                {f.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
        <Column
          tone="new"
          title="Incoming"
          cards={grouped.received}
          onAdvance={advance}
          onAdvanceLines={advanceLines}
          pending={isPending}
          stationFilter={stationFilter ?? null}
        />
        <Column
          tone="preparing"
          title="Preparing"
          cards={grouped.preparing}
          onAdvance={advance}
          onAdvanceLines={advanceLines}
          pending={isPending}
          stationFilter={stationFilter ?? null}
        />
        <Column
          tone="ready"
          title="Ready"
          cards={grouped.ready}
          onAdvance={advance}
          onAdvanceLines={advanceLines}
          pending={isPending}
          stationFilter={stationFilter ?? null}
        />
      </div>

      <KdsShortcutsFooter soundEnabled={soundEnabled} />
    </div>
  );
}

function KdsShortcutsFooter({ soundEnabled }: { soundEnabled: boolean }) {
  return (
    <footer className="border-ink-100 bg-canvas-50 text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl border px-4 py-2.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ShortcutHint keys={['Tab']} label="Move focus" />
        <ShortcutHint keys={['Enter']} label="Advance focused ticket" />
        <ShortcutHint keys={['S']} label="Toggle sound" />
      </div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full',
            soundEnabled ? 'bg-jade-500' : 'bg-ink-300 dark:bg-ink-600',
          )}
        />
        <span className="font-mono tracking-[0.14em] uppercase">
          {soundEnabled ? 'Sound on' : 'Muted'}
        </span>
      </div>
    </footer>
  );
}

function ShortcutHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}

function Column({
  tone,
  title,
  cards,
  onAdvance,
  onAdvanceLines,
  pending,
  stationFilter,
}: {
  tone: 'new' | 'preparing' | 'ready';
  title: string;
  cards: KdsCard[];
  onAdvance: (card: KdsCard) => void;
  onAdvanceLines: (card: KdsCard, next: 'preparing' | 'ready') => void;
  pending: boolean;
  stationFilter: string | null;
}) {
  const toneStyles = {
    new: {
      accent: 'bg-lapis-500',
      border: 'border-lapis-100 dark:border-lapis-500/30',
      heading: 'text-lapis-800 dark:text-lapis-300',
    },
    preparing: {
      accent: 'bg-saffron-500',
      border: 'border-saffron-100 dark:border-saffron-500/30',
      heading: 'text-saffron-800 dark:text-saffron-300',
    },
    ready: {
      accent: 'bg-jade-500',
      border: 'border-jade-100 dark:border-jade-500/30',
      heading: 'text-jade-800 dark:text-jade-300',
    },
  }[tone];

  return (
    <section
      className={cn(
        'bg-canvas-50 dark:bg-ink-900/60 flex min-h-0 flex-col gap-3 rounded-2xl border p-4',
        toneStyles.border,
      )}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn('size-2 rounded-full', toneStyles.accent)} />
          <h2
            className={cn(
              'text-[11px] font-semibold tracking-[0.18em] uppercase',
              toneStyles.heading,
            )}
          >
            {title}
          </h2>
        </div>
        <Badge variant="subtle" size="sm" shape="pill">
          {cards.length}
        </Badge>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {cards.length === 0 ? (
          <EmptyState
            compact
            title="All clear"
            description="No tickets in this lane."
            className="border-ink-200/70 bg-surface/50 dark:border-ink-800 dark:bg-ink-900/40 my-4"
          />
        ) : (
          cards.map((card) => (
            <Ticket
              key={card.id}
              card={card}
              onAdvance={onAdvance}
              onAdvanceLines={onAdvanceLines}
              pending={pending}
              stationFilter={stationFilter}
            />
          ))
        )}
      </div>
    </section>
  );
}

function Ticket({
  card,
  onAdvance,
  onAdvanceLines,
  pending,
  stationFilter,
}: {
  card: KdsCard;
  onAdvance: (card: KdsCard) => void;
  onAdvanceLines: (card: KdsCard, next: 'preparing' | 'ready') => void;
  pending: boolean;
  stationFilter: string | null;
}) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => forceTick((n) => n + 1), 10_000);
    return () => window.clearInterval(t);
  }, []);

  const ageMinutes = Math.floor((Date.now() - new Date(card.createdAt).getTime()) / 60_000);
  const severity = ageSeverity(ageMinutes);
  const action = STAGE_ACTIONS[card.status];
  const pickupNumber = formatPickupNumber(card);

  return (
    <article
      className={cn(
        'bg-surface dark:bg-ink-900 overflow-hidden rounded-xl border border-l-[3px] shadow-sm transition-shadow',
        card.suspicious
          ? 'border-saffron-400 ring-saffron-200 dark:ring-saffron-500/30 ring-2'
          : 'border-ink-100 dark:border-ink-800',
        severity === 'hot' && 'border-l-saffron-500 dark:border-l-saffron-400',
        severity === 'late' && 'border-l-mkrose-500 dark:border-l-mkrose-400',
      )}
    >
      <header className="border-ink-100 bg-canvas-50/70 dark:border-ink-800 dark:bg-ink-900/70 flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="mk-nums text-foreground font-mono text-3xl leading-none font-semibold tracking-tight">
            #{pickupNumber}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-ink-500 dark:text-ink-400 font-mono">{card.publicOrderId}</span>
            {card.tableNumber !== undefined ? (
              <Badge variant="outline" size="xs" shape="pill">
                Table {card.tableNumber}
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant={CHANNEL_VARIANT[card.channel] ?? 'subtle'} size="xs" shape="pill">
              {card.channel.replace('_', ' ')}
            </Badge>
            <span className="text-ink-500 dark:text-ink-400">{card.type.replace('_', ' ')}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              'mk-nums rounded-full px-2 py-1 font-mono text-xs font-medium tabular-nums',
              severity === 'ok' && 'bg-canvas-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
              severity === 'hot' &&
                'bg-saffron-100 text-saffron-900 dark:bg-saffron-500/15 dark:text-saffron-200',
              severity === 'late' &&
                'bg-mkrose-100 text-mkrose-900 dark:bg-mkrose-500/15 dark:text-mkrose-200',
            )}
          >
            {ageMinutes}m
          </span>
          {severity !== 'ok' ? (
            <span
              className={cn(
                'text-[10px] leading-none font-semibold tracking-[0.14em] uppercase',
                severity === 'hot' && 'text-saffron-700 dark:text-saffron-300',
                severity === 'late' && 'text-mkrose-700 dark:text-mkrose-300',
              )}
            >
              {severity === 'hot' ? 'Hot' : 'Late'}
            </span>
          ) : null}
        </div>
      </header>

      {card.suspicious ? (
        <div className="border-saffron-200 bg-saffron-50 text-saffron-900 dark:border-saffron-500/30 dark:bg-saffron-500/10 dark:text-saffron-200 flex items-start gap-2 border-b px-4 py-2 text-[11px] font-medium">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-px size-3.5 shrink-0"
            aria-hidden
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Flagged for review{card.suspiciousReason ? ` · ${card.suspiciousReason}` : ''}
        </div>
      ) : null}

      <ul className="divide-ink-100 dark:divide-ink-800 divide-y">
        {card.items.map((item) => {
          const isReady = item.lineStatus === 'ready';
          return (
            <li key={item.id} className={cn('px-4 py-3', isReady && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <span className="mk-nums bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950 mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-[13px] font-semibold tabular-nums">
                  {item.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-foreground font-serif text-base leading-tight font-medium',
                      isReady && 'line-through',
                    )}
                  >
                    {item.name}
                  </p>
                  {item.modifiers.length > 0 ? (
                    <p className="text-ink-600 dark:text-ink-300 mt-0.5 text-[12px]">
                      {item.modifiers.join(' · ')}
                    </p>
                  ) : null}
                  {item.notes ? (
                    <p className="bg-saffron-50 text-saffron-900 dark:bg-saffron-500/10 dark:text-saffron-200 mt-1 inline-block rounded px-2 py-0.5 text-[11px] italic">
                      &ldquo;{item.notes}&rdquo;
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {!stationFilter && item.stationName ? (
                      <Badge variant="outline" size="xs" shape="pill">
                        @ {item.stationName}
                      </Badge>
                    ) : null}
                    {stationFilter && isReady ? (
                      <Badge variant="success" size="xs" shape="pill">
                        <CheckIcon /> Done
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="border-ink-100 bg-canvas-50 dark:border-ink-800 dark:bg-ink-900/70 border-t px-4 py-3">
        {stationFilter ? (
          <StationActions card={card} pending={pending} onAdvanceLines={onAdvanceLines} />
        ) : action ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            full
            disabled={pending}
            onClick={() => onAdvance(card)}
          >
            {action.label}
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

function StationActions({
  card,
  pending,
  onAdvanceLines,
}: {
  card: KdsCard;
  pending: boolean;
  onAdvanceLines: (card: KdsCard, next: 'preparing' | 'ready') => void;
}) {
  const allReady = card.items.every((line) => line.lineStatus === 'ready');
  const anyPreparing = card.items.some((line) => line.lineStatus === 'preparing');
  if (allReady) {
    return (
      <div className="flex items-center justify-center gap-2 py-2">
        <Badge variant="success" size="md" shape="pill" dot dotColor="oklch(0.59 0.14 172)">
          Ready for pass
        </Badge>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      {!anyPreparing ? (
        <Button
          type="button"
          variant="outline"
          size="md"
          full
          disabled={pending}
          onClick={() => onAdvanceLines(card, 'preparing')}
        >
          Start
        </Button>
      ) : null}
      <Button
        type="button"
        variant="primary"
        size="md"
        full
        disabled={pending}
        onClick={() => onAdvanceLines(card, 'ready')}
      >
        Mark ready
      </Button>
    </div>
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
