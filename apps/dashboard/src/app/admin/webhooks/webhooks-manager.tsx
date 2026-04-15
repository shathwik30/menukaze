'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createWebhookSubscriptionAction,
  deleteWebhookSubscriptionAction,
  retryWebhookDeliveryAction,
  sendTestWebhookAction,
  toggleWebhookSubscriptionAction,
  type CreatedSubscription,
} from '@/app/actions/webhooks';

interface Subscription {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  description: string;
  createdAt: string;
}

interface Delivery {
  id: string;
  subscriptionId: string;
  eventType: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  createdAt: string;
  deliveredAt: string | null;
  lastResponseStatus: number | null;
  lastError: string | null;
}

const EVENT_OPTIONS = [
  'order.created',
  'order.confirmed',
  'order.preparing',
  'order.ready',
  'order.completed',
  'order.cancelled',
  'payment.completed',
  'payment.failed',
  'payment.refunded',
  'reservation.created',
  'reservation.cancelled',
  'table_session.started',
  'table_session.bill_requested',
  'table_session.closed',
];

const STATUS_BADGE: Record<Delivery['status'], string> = {
  pending: 'bg-amber-100 text-amber-900',
  delivered: 'bg-emerald-100 text-emerald-900',
  failed: 'bg-red-100 text-red-900',
};

export function WebhooksManager({
  subscriptions,
  deliveries,
}: {
  subscriptions: Subscription[];
  deliveries: Delivery[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['order.created']);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedSubscription | null>(null);
  const [pending, start] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);

  const onCreate = (): void => {
    setError(null);
    setCreated(null);
    if (events.length === 0) {
      setError('Pick at least one event.');
      return;
    }
    start(async () => {
      const result = await createWebhookSubscriptionAction({
        url,
        events,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.data);
      setUrl('');
      setDescription('');
      router.refresh();
    });
  };

  const onToggle = (id: string, enabled: boolean): void => {
    setError(null);
    setActionId(id);
    start(async () => {
      const result = await toggleWebhookSubscriptionAction(id, enabled);
      if (!result.ok) setError(result.error);
      setActionId(null);
      router.refresh();
    });
  };

  const onDelete = (id: string): void => {
    setError(null);
    setActionId(id);
    start(async () => {
      const result = await deleteWebhookSubscriptionAction(id);
      if (!result.ok) setError(result.error);
      setActionId(null);
      router.refresh();
    });
  };

  const onTest = (id: string): void => {
    setError(null);
    setActionId(id);
    start(async () => {
      const result = await sendTestWebhookAction({ subscriptionId: id });
      if (!result.ok) setError(result.error);
      setActionId(null);
      router.refresh();
    });
  };

  const onRetry = (deliveryId: string): void => {
    setError(null);
    setActionId(deliveryId);
    start(async () => {
      const result = await retryWebhookDeliveryAction(deliveryId);
      if (!result.ok) setError(result.error);
      setActionId(null);
      router.refresh();
    });
  };

  const toggleEvent = (event: string): void => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  return (
    <div className="space-y-8">
      <section className="border-border space-y-3 rounded-md border p-4">
        <h2 className="text-base font-semibold">Add subscription</h2>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/menukaze-webhook"
          className="border-border h-9 w-full rounded-md border px-3 text-sm"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          maxLength={200}
          className="border-border h-9 w-full rounded-md border px-3 text-sm"
        />
        <fieldset className="grid gap-1 sm:grid-cols-2">
          <legend className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Events
          </legend>
          {EVENT_OPTIONS.map((event) => (
            <label key={event} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={events.includes(event)}
                onChange={() => toggleEvent(event)}
              />
              <span className="font-mono">{event}</span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={onCreate}
          disabled={pending || !url}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
        >
          Create subscription
        </button>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {created ? (
        <section className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="font-semibold">Webhook signing secret (save it now):</p>
          <pre className="mt-2 overflow-x-auto rounded bg-emerald-900 px-3 py-2 font-mono text-xs text-emerald-50">
            {created.secret}
          </pre>
          <p className="text-muted-foreground mt-2 text-xs">
            Use this to verify the X-Menukaze-Signature header on every delivery.
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Subscriptions</h2>
        {subscriptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No subscriptions yet.</p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-md border">
            {subscriptions.map((s) => {
              const isPending = pending && actionId === s.id;
              return (
                <li key={s.id} className="space-y-1 p-3">
                  <p className="font-mono text-xs">{s.url}</p>
                  <p className="text-muted-foreground text-xs">
                    {s.events.join(', ')}
                    {s.description ? ` · ${s.description}` : ''}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`rounded-sm px-2 py-0.5 ${
                        s.enabled ? 'bg-emerald-100 text-emerald-900' : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      {s.enabled ? 'enabled' : 'disabled'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggle(s.id, !s.enabled)}
                      disabled={isPending}
                      className="border-border hover:bg-muted inline-flex h-7 items-center rounded-md border px-2 disabled:opacity-50"
                    >
                      {s.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onTest(s.id)}
                      disabled={isPending || !s.enabled}
                      className="border-border hover:bg-muted inline-flex h-7 items-center rounded-md border px-2 disabled:opacity-50"
                    >
                      Send test
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id)}
                      disabled={isPending}
                      className="ml-auto text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Recent deliveries</h2>
        {deliveries.length === 0 ? (
          <p className="text-muted-foreground text-sm">No deliveries yet.</p>
        ) : (
          <table className="border-border w-full border text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">HTTP</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-border border-t">
                  <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{d.eventType}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`rounded-sm px-2 py-0.5 ${STATUS_BADGE[d.status]}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{d.attempts}</td>
                  <td className="px-3 py-2 text-xs">
                    {d.lastResponseStatus ?? d.lastError ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {d.status === 'failed' ? (
                      <button
                        type="button"
                        onClick={() => onRetry(d.id)}
                        disabled={pending && actionId === d.id}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        Retry
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
