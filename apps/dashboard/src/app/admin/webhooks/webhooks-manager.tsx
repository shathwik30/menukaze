'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  type BadgeProps,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  cn,
  EmptyState,
  FieldError,
  Input,
  Label,
} from '@menukaze/ui';
import { WEBHOOK_EVENT_TYPES } from '@menukaze/shared';
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

const EVENT_OPTIONS: readonly string[] = WEBHOOK_EVENT_TYPES;

const STATUS_VARIANT: Record<Delivery['status'], NonNullable<BadgeProps['variant']>> = {
  pending: 'warning',
  delivered: 'success',
  failed: 'danger',
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
  const [copied, setCopied] = useState(false);

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

  const copySecret = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card variant="surface" radius="lg">
        <CardHeader>
          <CardTitle>Add subscription</CardTitle>
          <CardDescription>
            Your endpoint will receive an HTTP POST for every subscribed event.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wh-url" required>
              Endpoint URL
            </Label>
            <Input
              id="wh-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/menukaze-webhook"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-desc">
              Description <span className="text-ink-400">(optional)</span>
            </Label>
            <Input
              id="wh-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this endpoint is for"
              maxLength={200}
            />
          </div>

          <fieldset>
            <legend className="text-ink-600 dark:text-ink-400 mb-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
              Events ({events.length} selected)
            </legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {EVENT_OPTIONS.map((event) => {
                const active = events.includes(event);
                return (
                  <label
                    key={event}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors',
                      active
                        ? 'border-saffron-500/60 bg-saffron-50 dark:bg-saffron-500/10'
                        : 'border-ink-200 bg-surface hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-ink-700',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                        active
                          ? 'border-saffron-600 bg-saffron-500 text-white'
                          : 'border-ink-300 dark:border-ink-600',
                      )}
                    >
                      {active ? (
                        <svg
                          viewBox="0 0 12 12"
                          className="size-2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      ) : null}
                    </span>
                    <Checkbox
                      className="sr-only"
                      checked={active}
                      onChange={() => toggleEvent(event)}
                    />
                    <span className="font-mono">{event}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onCreate}
            disabled={pending || !url}
            loading={pending}
          >
            Create subscription
          </Button>
        </CardContent>
      </Card>

      {error ? <FieldError>{error}</FieldError> : null}

      {created ? (
        <Card
          variant="surface"
          radius="lg"
          className="border-jade-300 bg-jade-50/60 dark:border-jade-500/30 dark:bg-jade-500/10"
        >
          <CardHeader>
            <Badge variant="success" size="sm" shape="pill" dot>
              Subscription created
            </Badge>
            <CardTitle className="mt-3 font-serif text-2xl">Signing secret</CardTitle>
            <CardDescription>
              Save this now — use it to verify the{' '}
              <code className="font-mono text-[12px]">X-Menukaze-Signature</code> header on every
              delivery.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-ink-950 group relative overflow-hidden rounded-xl shadow-inner">
              <pre className="text-saffron-300 overflow-x-auto px-4 py-4 font-mono text-sm">
                {created.secret}
              </pre>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={copySecret}
                className="absolute top-3 right-3"
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card variant="surface" radius="lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Subscriptions</CardTitle>
            <Badge variant="subtle" size="sm" shape="pill">
              {subscriptions.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <EmptyState
              compact
              title="No subscriptions yet"
              description="Add an HTTPS endpoint above to start receiving events."
            />
          ) : (
            <ul className="divide-ink-100 dark:divide-ink-800 divide-y">
              {subscriptions.map((s) => {
                const isPending = pending && actionId === s.id;
                return (
                  <li key={s.id} className="flex flex-col gap-2 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={s.enabled ? 'success' : 'subtle'}
                            size="xs"
                            shape="pill"
                            dot
                            dotColor={s.enabled ? 'oklch(0.59 0.14 172)' : undefined}
                          >
                            {s.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          {s.description ? (
                            <span className="text-ink-500 dark:text-ink-400 text-xs">
                              {s.description}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-foreground mt-2 font-mono text-[13px] break-all">
                          {s.url}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.events.map((ev) => (
                            <Badge key={ev} variant="outline" size="xs">
                              <span className="font-mono">{ev}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onToggle(s.id, !s.enabled)}
                          disabled={isPending}
                        >
                          {s.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onTest(s.id)}
                          disabled={isPending || !s.enabled}
                        >
                          Send test
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(s.id)}
                          disabled={isPending}
                          className="text-mkrose-600 hover:text-mkrose-700"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card variant="surface" radius="lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent deliveries</CardTitle>
            <Badge variant="subtle" size="sm" shape="pill">
              Last {deliveries.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {deliveries.length === 0 ? (
            <div className="p-6">
              <EmptyState
                compact
                title="No deliveries yet"
                description="When events fire, you'll see their delivery status here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-ink-100 bg-canvas-50 dark:border-ink-800 dark:bg-ink-900/60 border-b">
                  <tr className="text-ink-500 text-left text-[11px] font-semibold tracking-[0.12em] uppercase">
                    <th className="px-6 py-3">When</th>
                    <th className="px-6 py-3">Event</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Attempts</th>
                    <th className="px-6 py-3">Response</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-ink-100 dark:divide-ink-800 divide-y">
                  {deliveries.map((d) => (
                    <tr
                      key={d.id}
                      className="hover:bg-canvas-50/60 dark:hover:bg-ink-900/50 transition-colors"
                    >
                      <td className="text-ink-500 dark:text-ink-400 px-6 py-3 font-mono text-[12px]">
                        {new Date(d.createdAt).toLocaleString()}
                      </td>
                      <td className="text-foreground px-6 py-3 font-mono text-[12px]">
                        {d.eventType}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={STATUS_VARIANT[d.status]} size="xs" shape="pill">
                          {d.status}
                        </Badge>
                      </td>
                      <td className="text-ink-600 dark:text-ink-300 px-6 py-3 text-xs">
                        <span className="mk-nums font-mono tabular-nums">{d.attempts}</span>
                      </td>
                      <td className="px-6 py-3 text-xs">
                        {d.lastResponseStatus ? (
                          <span
                            className={cn(
                              'mk-nums font-mono tabular-nums',
                              d.lastResponseStatus >= 200 && d.lastResponseStatus < 300
                                ? 'text-jade-700 dark:text-jade-300'
                                : 'text-mkrose-700 dark:text-mkrose-300',
                            )}
                          >
                            HTTP {d.lastResponseStatus}
                          </span>
                        ) : d.lastError ? (
                          <span className="text-mkrose-700 dark:text-mkrose-300">
                            {d.lastError.slice(0, 40)}
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {d.status === 'failed' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRetry(d.id)}
                            disabled={pending && actionId === d.id}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
