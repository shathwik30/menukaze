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
import { Checkbox } from '@menukaze/ui';
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

const STAGE_ACTIONS: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  received: { next: 'confirmed', label: 'Confirm' },
  confirmed: { next: 'preparing', label: 'Start prepping' },
  preparing: { next: 'ready', label: 'Mark ready' },
  ready: { next: 'completed', label: 'Complete' },
};

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          padding: '10px 14px',
          background: 'white',
          borderRadius: 12,
          border: '1px solid var(--mk-ink-100)',
        }}
      >
        {/* Sound toggle */}
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--mk-ink-600)',
            fontWeight: 500,
          }}
        >
          <span
            style={{
              position: 'relative',
              display: 'inline-flex',
              width: 36,
              height: 20,
              borderRadius: 99,
              background: soundEnabled ? 'var(--mk-saffron-500)' : 'var(--mk-ink-200)',
              transition: 'background 150ms',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: soundEnabled ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: 99,
                background: 'white',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                transition: 'left 150ms',
              }}
            />
            <Checkbox
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="sr-only"
            />
          </span>
          Sound alerts
        </label>
        <div style={{ width: 1, height: 20, background: 'var(--mk-ink-200)' }} />
        {/* Channel filter */}
        <div
          style={{
            display: 'inline-flex',
            gap: 2,
            padding: 2,
            background: 'var(--mk-canvas-100)',
            borderRadius: 8,
          }}
        >
          {CHANNEL_FILTERS.map((f) => {
            const active = channelFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setChannelFilter(f.id)}
                style={{
                  height: 26,
                  padding: '0 10px',
                  fontSize: 11.5,
                  fontWeight: 500,
                  borderRadius: 6,
                  background: active ? 'white' : 'transparent',
                  color: active ? 'var(--mk-ink-950)' : 'var(--mk-ink-500)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                  boxShadow: active ? '0 1px 2px rgb(0 0 0 / 0.06)' : 'none',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
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
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px 24px',
        padding: '10px 16px',
        borderRadius: 12,
        background: 'white',
        border: '1px solid var(--mk-ink-100)',
        fontSize: 11,
        color: 'var(--mk-ink-400)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 20px' }}>
        <ShortcutHint keys={['Tab']} label="Move focus" />
        <ShortcutHint keys={['Enter']} label="Advance focused ticket" />
        <ShortcutHint keys={['S']} label="Toggle sound" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: soundEnabled ? 'var(--mk-jade-500)' : 'var(--mk-ink-300)',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--mk-ink-400)',
          }}
        >
          {soundEnabled ? 'Sound on' : 'Muted'}
        </span>
      </div>
    </footer>
  );
}

function ShortcutHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {keys.map((k) => (
        <kbd
          key={k}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 20,
            height: 18,
            padding: '0 5px',
            borderRadius: 4,
            background: 'var(--mk-canvas-100)',
            border: '1px solid var(--mk-ink-200)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            fontWeight: 600,
            color: 'var(--mk-ink-700)',
          }}
        >
          {k}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}

const TONE_STYLE = {
  new: { dot: 'var(--mk-lapis-500)', label: 'var(--mk-lapis-700)' },
  preparing: { dot: 'var(--mk-saffron-500)', label: 'var(--mk-saffron-700)' },
  ready: { dot: 'var(--mk-jade-500)', label: 'var(--mk-jade-700)' },
};

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
  const ts = TONE_STYLE[tone];
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--mk-canvas-50)',
        borderRadius: 14,
        border: '1px solid var(--mk-ink-100)',
        padding: 14,
        minHeight: 300,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: ts.dot }} />
          <h2
            style={{
              margin: 0,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: ts.label,
            }}
          >
            {title}
          </h2>
        </div>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 999,
            background: 'var(--mk-ink-100)',
            color: 'var(--mk-ink-500)',
          }}
        >
          {cards.length}
        </span>
      </header>

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}
      >
        {cards.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              margin: '8px 0',
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 10,
            }}
          >
            <p style={{ fontSize: 12, color: 'var(--mk-ink-400)', margin: 0 }}>All clear</p>
          </div>
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

const CHANNEL_CHIP: Record<string, { bg: string; fg: string }> = {
  storefront: { bg: 'var(--mk-lapis-50)', fg: 'var(--mk-lapis-700)' },
  qr_dinein: { bg: 'var(--mk-jade-50)', fg: 'var(--mk-jade-700)' },
  kiosk: { bg: 'var(--mk-saffron-50)', fg: 'var(--mk-saffron-700)' },
  walk_in: { bg: 'var(--mk-ink-100)', fg: 'var(--mk-ink-600)' },
  api: { bg: 'var(--mk-rose-50)', fg: 'var(--mk-rose-700)' },
};

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
  const chanChip = CHANNEL_CHIP[card.channel] ?? {
    bg: 'var(--mk-ink-100)',
    fg: 'var(--mk-ink-600)',
  };

  const ageColor =
    severity === 'late'
      ? { bg: 'var(--mk-rose-50)', fg: 'var(--mk-rose-700)' }
      : severity === 'hot'
        ? { bg: 'var(--mk-saffron-50)', fg: 'var(--mk-saffron-700)' }
        : { bg: 'var(--mk-ink-100)', fg: 'var(--mk-ink-500)' };

  const leftBorder =
    severity === 'late'
      ? '3px solid var(--mk-rose-400)'
      : severity === 'hot'
        ? '3px solid var(--mk-saffron-400)'
        : '3px solid var(--mk-ink-150, var(--mk-ink-200))';

  return (
    <article
      style={{
        background: 'white',
        borderRadius: 12,
        border: card.suspicious
          ? '1px solid var(--mk-saffron-300)'
          : '1px solid var(--mk-ink-150, var(--mk-ink-200))',
        borderLeft: leftBorder,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgb(0 0 0 / 0.04)',
      }}
    >
      {/* Ticket header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 14px 10px',
          background: 'var(--mk-canvas-50)',
          borderBottom: '1px solid var(--mk-ink-100)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--mk-ink-950)',
              lineHeight: 1,
            }}
          >
            #{pickupNumber}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 5,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--mk-ink-400)',
              }}
            >
              {card.publicOrderId}
            </span>
            {card.tableNumber !== undefined ? (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  padding: '1px 6px',
                  borderRadius: 99,
                  background: 'var(--mk-ink-100)',
                  color: 'var(--mk-ink-600)',
                }}
              >
                Table {card.tableNumber}
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                padding: '2px 7px',
                borderRadius: 99,
                background: chanChip.bg,
                color: chanChip.fg,
              }}
            >
              {card.channel.replace('_', ' ')}
            </span>
            <span
              style={{ fontSize: 10.5, color: 'var(--mk-ink-400)', textTransform: 'capitalize' }}
            >
              {card.type.replace('_', ' ')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 99,
              background: ageColor.bg,
              color: ageColor.fg,
            }}
          >
            {ageMinutes}m
          </span>
          {severity !== 'ok' ? (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: severity === 'late' ? 'var(--mk-rose-600)' : 'var(--mk-saffron-600)',
              }}
            >
              {severity === 'late' ? 'Late' : 'Hot'}
            </span>
          ) : null}
        </div>
      </header>

      {card.suspicious ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '7px 14px',
            fontSize: 11,
            fontWeight: 500,
            background: 'var(--mk-saffron-50)',
            color: 'var(--mk-saffron-700)',
            borderBottom: '1px solid var(--mk-ink-100)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 13, height: 13, flexShrink: 0 }}
            aria-hidden
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Flagged{card.suspiciousReason ? ` · ${card.suspiciousReason}` : ''}
        </div>
      ) : null}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {card.items.map((item) => {
          const isReady = item.lineStatus === 'ready';
          return (
            <li
              key={item.id}
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--mk-ink-100)',
                opacity: isReady ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 26,
                    height: 26,
                    borderRadius: 6,
                    flexShrink: 0,
                    background: 'var(--mk-canvas-100)',
                    color: 'var(--mk-ink-800)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {item.quantity}×
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: 'var(--font-serif)',
                      fontSize: 14.5,
                      fontWeight: 500,
                      color: 'var(--mk-ink-950)',
                      lineHeight: 1.3,
                      textDecoration: isReady ? 'line-through' : 'none',
                    }}
                  >
                    {item.name}
                  </p>
                  {item.modifiers.length > 0 ? (
                    <p
                      style={{
                        margin: '3px 0 0',
                        fontSize: 11.5,
                        color: 'var(--mk-ink-400)',
                        lineHeight: 1.4,
                      }}
                    >
                      {item.modifiers.join(' · ')}
                    </p>
                  ) : null}
                  {item.notes ? (
                    <p
                      style={{
                        margin: '5px 0 0',
                        display: 'inline-block',
                        fontSize: 11,
                        fontStyle: 'italic',
                        padding: '2px 8px',
                        borderRadius: 5,
                        background: 'var(--mk-saffron-50)',
                        color: 'var(--mk-saffron-700)',
                      }}
                    >
                      &ldquo;{item.notes}&rdquo;
                    </p>
                  ) : null}
                  {!stationFilter && item.stationName ? (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 4,
                        fontSize: 10.5,
                        fontWeight: 500,
                        padding: '1px 6px',
                        borderRadius: 99,
                        background: 'var(--mk-ink-100)',
                        color: 'var(--mk-ink-400)',
                      }}
                    >
                      @ {item.stationName}
                    </span>
                  ) : null}
                  {stationFilter && isReady ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        marginTop: 4,
                        fontSize: 10.5,
                        fontWeight: 600,
                        padding: '1px 7px',
                        borderRadius: 99,
                        background: 'var(--mk-jade-50)',
                        color: 'var(--mk-jade-700)',
                      }}
                    >
                      <CheckIcon /> Done
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <footer
        style={{
          padding: '10px 14px',
          background: 'var(--mk-canvas-50)',
          borderTop: '1px solid var(--mk-ink-100)',
        }}
      >
        {stationFilter ? (
          <StationActions card={card} pending={pending} onAdvanceLines={onAdvanceLines} />
        ) : action ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onAdvance(card)}
            style={{
              width: '100%',
              height: 34,
              borderRadius: 8,
              background: 'var(--mk-ink-950)',
              color: 'var(--mk-canvas-50)',
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: '-0.005em',
              border: 'none',
              cursor: pending ? 'not-allowed' : 'pointer',
              opacity: pending ? 0.6 : 1,
              transition: 'opacity 150ms',
            }}
          >
            {action.label}
          </button>
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 0',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 12px',
            borderRadius: 99,
            background: 'var(--mk-jade-50)',
            color: 'var(--mk-jade-700)',
          }}
        >
          <span
            style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--mk-jade-500)' }}
          />
          Ready for pass
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {!anyPreparing ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvanceLines(card, 'preparing')}
          style={{
            flex: 1,
            height: 34,
            borderRadius: 8,
            background: 'var(--mk-canvas-100)',
            color: 'var(--mk-ink-700)',
            fontSize: 12.5,
            fontWeight: 600,
            border: '1px solid var(--mk-ink-200)',
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
            transition: 'opacity 150ms',
          }}
        >
          Start
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => onAdvanceLines(card, 'ready')}
        style={{
          flex: 1,
          height: 34,
          borderRadius: 8,
          background: 'var(--mk-ink-950)',
          color: 'var(--mk-canvas-50)',
          fontSize: 12.5,
          fontWeight: 600,
          border: 'none',
          cursor: pending ? 'not-allowed' : 'pointer',
          opacity: pending ? 0.6 : 1,
          transition: 'opacity 150ms',
        }}
      >
        Mark ready
      </button>
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
      style={{ width: 10, height: 10 }}
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
