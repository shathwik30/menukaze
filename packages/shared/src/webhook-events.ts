import type { OrderChannel, OrderChannelKind, OrderStatus, OrderType } from './domain';
import { orderChannelKind } from './domain';

export const WEBHOOK_EVENT_TYPES = [
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
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

const WEBHOOK_EVENT_TYPE_SET: ReadonlySet<string> = new Set(WEBHOOK_EVENT_TYPES);

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === 'string' && WEBHOOK_EVENT_TYPE_SET.has(value);
}

// Transient statuses (`received`, `served`, `out_for_delivery`, `delivered`)
// have no public counterpart and map to null.
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
