/**
 * Public webhook event registry. The dashboard "Webhooks" UI lists subscribers'
 * subscriptions against this set, the storefront/kiosk/qr/walk-in/api code
 * paths emit events from this set, and the public API documents this set.
 *
 * Adding a new event:
 *   1. Add the literal string here.
 *   2. (Optional) add a helper for the payload shape.
 *   3. Update the dashboard webhooks form to expose it.
 */

import type { OrderChannel, OrderChannelKind, OrderStatus, OrderType } from './domain';
import { orderChannelKind } from './domain';

export const WEBHOOK_EVENT_TYPES = [
  // Order lifecycle (driven by the dashboard FSM + storefront/api/kiosk/qr/walk-in creators)
  'order.created',
  'order.confirmed',
  'order.preparing',
  'order.ready',
  'order.completed',
  'order.cancelled',
  // Payment events (emitted by the payment adapters once webhook ingestion lands)
  'payment.completed',
  'payment.failed',
  'payment.refunded',
  // Reservation lifecycle (storefront & dashboard reservations)
  'reservation.created',
  'reservation.cancelled',
  // Dine-in table session lifecycle (qr-dinein actions + worker sweeper)
  'table_session.started',
  'table_session.bill_requested',
  'table_session.closed',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

const WEBHOOK_EVENT_TYPE_SET: ReadonlySet<string> = new Set(WEBHOOK_EVENT_TYPES);

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === 'string' && WEBHOOK_EVENT_TYPE_SET.has(value);
}

/**
 * Map an order status transition to its public webhook event type. Used by
 * the dashboard order FSM and the kitchen taps. Returns null for transient
 * states that do not have a public counterpart (e.g. `served`, `delivered`).
 */
export const ORDER_STATUS_TO_WEBHOOK_EVENT: Readonly<
  Partial<Record<OrderStatus, WebhookEventType>>
> = {
  confirmed: 'order.confirmed',
  preparing: 'order.preparing',
  ready: 'order.ready',
  completed: 'order.completed',
  cancelled: 'order.cancelled',
};

export function webhookEventForOrderStatus(status: OrderStatus): WebhookEventType | null {
  return ORDER_STATUS_TO_WEBHOOK_EVENT[status] ?? null;
}

// ---------------------------------------------------------------------------
// Payload helpers — keep wire shape consistent across producers
// ---------------------------------------------------------------------------

/**
 * Standard channel descriptor inside every order webhook payload. Built-in
 * channels return `{ id: 'walk_in', type: 'built_in' }` while API-channel
 * orders return `{ id: '<api_key_id>', name, type: 'api' }`.
 */
export interface OrderWebhookChannelPayload {
  id: string;
  name?: string;
  type: OrderChannelKind;
}

export function orderWebhookChannel(channel: OrderChannel): OrderWebhookChannelPayload {
  return { id: channel, type: orderChannelKind(channel) };
}

export function orderWebhookApiChannel(
  apiKeyId: string,
  channelName: string,
): OrderWebhookChannelPayload {
  return { id: apiKeyId, name: channelName, type: 'api' };
}

export interface OrderCreatedWebhookPayload {
  id: string;
  public_order_id: string;
  channel: OrderWebhookChannelPayload;
  type: OrderType;
  status: OrderStatus;
  total_minor: number;
  currency: string;
  table_session_id?: string;
  customer?: { email: string; name: string };
}

export interface OrderStatusChangedWebhookPayload {
  id: string;
  public_order_id: string;
  channel: OrderWebhookChannelPayload;
  status: OrderStatus;
  total_minor: number;
  currency: string;
  cancel_reason?: string;
}
