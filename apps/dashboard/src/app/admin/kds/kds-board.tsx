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
import { updateOrderStatusAction } from '@/app/actions/orders';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface KdsCard {
  id: string;
  publicOrderId: string;
  channel: string;
  type: string;
  status: OrderStatus;
  createdAt: string;
  items: Array<{
    quantity: number;
    name: string;
    modifiers: string[];
    notes?: string;
  }>;
  tableId?: string;
  tableNumber?: number;
}

interface Props {
  restaurantId: string;
  initialCards: KdsCard[];
}

const CHANNEL_BADGE: Record<string, string> = {
  storefront: 'bg-blue-100 text-blue-800 border-blue-200',
  qr_dinein: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  kiosk: 'bg-orange-100 text-orange-800 border-orange-200',
  walk_in: 'bg-zinc-100 text-zinc-800 border-zinc-200',
  api: 'bg-violet-100 text-violet-800 border-violet-200',
};

const STAGE_ACTIONS: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  received: { next: 'confirmed', label: 'Confirm' },
  confirmed: { next: 'preparing', label: 'Start' },
  preparing: { next: 'ready', label: 'Ready' },
  ready: { next: 'completed', label: 'Complete' },
};

/**
 * Play a short beep via the Web Audio API when a new order arrives. No
 * external audio file: keeps the KDS self-contained and avoids licensing.
 *
 * Returns a *stable* function reference (via useCallback + enabledRef) so
 * callers can safely put it in useEffect dependency arrays without triggering
 * reconnects on every render.
 */
function useNewOrderChime(enabled: boolean): () => void {
  const ctxRef = useRef<AudioContext | null>(null);
  // Track enabled via ref so the stable callback always reads the latest value.
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
  }, []); // Stable because it reads enabled from ref.
}

const CHANNEL_FILTERS: Array<{
  id: 'all' | 'storefront' | 'qr_dinein' | 'kiosk' | 'walk_in' | 'api';
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'storefront', label: 'Storefront' },
  { id: 'qr_dinein', label: 'QR' },
  { id: 'kiosk', label: 'Kiosk' },
  { id: 'walk_in', label: 'Walk-in' },
  { id: 'api', label: 'API' },
];

type ChannelFilter = (typeof CHANNEL_FILTERS)[number]['id'];

export function KdsBoard({ restaurantId, initialCards }: Props) {
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
        // Full card isn't on the event; re-fetch the server component.
        chime();
        router.refresh();
      } else if (msg.name === 'order.status_changed' && isOrderStatusChangedEvent(msg.data)) {
        const data = msg.data;
        const status = data.status;
        setCards((prev) => {
          // If the new status is terminal, drop the card from the KDS.
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => setSoundEnabled(e.target.checked)}
          />
          Sound alerts
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {CHANNEL_FILTERS.map((f) => {
            const active = channelFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setChannelFilter(f.id)}
                className={
                  active
                    ? 'border-foreground bg-foreground text-background rounded-full border px-3 py-1'
                    : 'border-input text-muted-foreground rounded-full border px-3 py-1'
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
        <Column title="New" cards={grouped.received} onAdvance={advance} pending={isPending} />
        <Column
          title="Preparing"
          cards={grouped.preparing}
          onAdvance={advance}
          pending={isPending}
        />
        <Column title="Ready" cards={grouped.ready} onAdvance={advance} pending={isPending} />
      </div>
    </>
  );

  function advance(card: KdsCard): void {
    const action = STAGE_ACTIONS[card.status];
    if (!action) return;
    start(async () => {
      const result = await updateOrderStatusAction({
        orderId: card.id,
        nextStatus: action.next,
      });
      if (!result.ok) return;
      // Optimistic local update; Ably event will reconcile.
      setCards((prev) => {
        if (result.status === 'completed') {
          return prev.filter((c) => c.id !== card.id);
        }
        return prev.map((c) => (c.id === card.id ? { ...c, status: result.status } : c));
      });
    });
  }
}

function Column({
  title,
  cards,
  onAdvance,
  pending,
}: {
  title: string;
  cards: KdsCard[];
  onAdvance: (card: KdsCard) => void;
  pending: boolean;
}) {
  return (
    <section className="bg-muted flex flex-col gap-3 rounded-lg p-3">
      <h2 className="text-foreground text-sm font-semibold uppercase tracking-wide">
        {title} ({cards.length})
      </h2>
      {cards.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nothing here yet.</p>
      ) : (
        cards.map((card) => (
          <Card key={card.id} card={card} onAdvance={onAdvance} pending={pending} />
        ))
      )}
    </section>
  );
}

function Card({
  card,
  onAdvance,
  pending,
}: {
  card: KdsCard;
  onAdvance: (card: KdsCard) => void;
  pending: boolean;
}) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => forceTick((n) => n + 1), 10_000);
    return () => window.clearInterval(t);
  }, []);

  const ageMinutes = Math.floor((Date.now() - new Date(card.createdAt).getTime()) / 60_000);
  const ageClass =
    ageMinutes < 5 ? 'text-muted-foreground' : ageMinutes < 10 ? 'text-amber-600' : 'text-red-600';

  const action = STAGE_ACTIONS[card.status];
  const pickupNumber = formatPickupNumber(card.publicOrderId);

  return (
    <article className="border-border bg-background rounded-md border p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-foreground font-mono text-2xl font-bold">#{pickupNumber}</p>
          <p className="text-muted-foreground font-mono text-xs font-semibold">
            {card.publicOrderId}
            {card.tableNumber !== undefined ? (
              <span className="ml-2 font-sans text-xs font-semibold">
                · Table {card.tableNumber}
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground text-[11px]">
            <span
              className={`rounded-sm border px-1 py-0.5 ${CHANNEL_BADGE[card.channel] ?? 'border-border bg-muted'}`}
            >
              {card.channel}
            </span>{' '}
            {card.type}
          </p>
        </div>
        <span className={`font-mono text-xs ${ageClass}`}>{ageMinutes}m</span>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {card.items.map((item, i) => (
          <li key={i}>
            <span className="text-foreground font-medium">
              {item.quantity}× {item.name}
            </span>
            {item.modifiers.length > 0 ? (
              <span className="text-muted-foreground ml-2 text-xs">
                {item.modifiers.join(', ')}
              </span>
            ) : null}
            {item.notes ? (
              <span className="text-muted-foreground ml-2 text-xs italic">“{item.notes}”</span>
            ) : null}
          </li>
        ))}
      </ul>
      {action ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvance(card)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 w-full rounded-md py-2 text-sm font-semibold disabled:opacity-50"
        >
          {action.label}
        </button>
      ) : null}
    </article>
  );
}
