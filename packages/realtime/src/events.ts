/**
 * Real-time event payload contracts.
 *
 * Every realtime message is one of these envelopes. Server publishes are
 * typed against `RealtimeEvent`, so the browser can pattern-match on
 * `event.type` to a fully typed payload.
 */

export type OrderStatus =
  | 'received'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export interface OrderCreatedEvent {
  type: 'order.created';
  orderId: string;
  channelId: string;
  totalMinor: number;
  currency: string;
  createdAt: string;
}

export interface OrderStatusChangedEvent {
  type: 'order.status_changed';
  orderId: string;
  status: OrderStatus;
  changedAt: string;
}

export type TableStatusReason =
  | 'session_started'
  | 'bill_requested'
  | 'payment_succeeded'
  | 'table_released'
  | 'timeout_unpaid';

export interface TableStatusChangedEvent {
  type: 'table.status_changed';
  tableId: string;
  status: 'available' | 'occupied' | 'bill_requested' | 'paid' | 'needs_review';
  changedAt: string;
  reason?: TableStatusReason;
}

export type WaiterAlertReason = 'call_waiter' | 'payment_help';

export interface WaiterCalledEvent {
  type: 'waiter.called';
  tableId: string;
  sessionId: string;
  calledAt: string;
  reason?: WaiterAlertReason;
}

export type SessionUpdateReason =
  | 'participant_joined'
  | 'round_added'
  | 'bill_requested'
  | 'payment_succeeded'
  | 'closed'
  | 'needs_review';

export interface SessionUpdatedEvent {
  type: 'session.updated';
  sessionId: string;
  updatedAt: string;
  reason: SessionUpdateReason;
}

export type RealtimeEvent =
  | OrderCreatedEvent
  | OrderStatusChangedEvent
  | TableStatusChangedEvent
  | WaiterCalledEvent
  | SessionUpdatedEvent;

const ORDER_STATUSES = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'served',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
] as const satisfies readonly OrderStatus[];
const ORDER_STATUS_SET: ReadonlySet<string> = new Set(ORDER_STATUSES);

const TABLE_STATUSES = [
  'available',
  'occupied',
  'bill_requested',
  'paid',
  'needs_review',
] as const satisfies readonly TableStatusChangedEvent['status'][];
const TABLE_STATUS_SET: ReadonlySet<string> = new Set(TABLE_STATUSES);

const WAITER_ALERT_REASONS = [
  'call_waiter',
  'payment_help',
] as const satisfies readonly WaiterAlertReason[];
const WAITER_ALERT_REASON_SET: ReadonlySet<string> = new Set(WAITER_ALERT_REASONS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && ORDER_STATUS_SET.has(value);
}

export function isOrderStatusChangedEvent(value: unknown): value is OrderStatusChangedEvent {
  return (
    isRecord(value) &&
    value['type'] === 'order.status_changed' &&
    typeof value['orderId'] === 'string' &&
    isOrderStatus(value['status']) &&
    typeof value['changedAt'] === 'string'
  );
}

export function isOrderCreatedEvent(value: unknown): value is OrderCreatedEvent {
  return (
    isRecord(value) &&
    value['type'] === 'order.created' &&
    typeof value['orderId'] === 'string' &&
    typeof value['channelId'] === 'string' &&
    typeof value['totalMinor'] === 'number' &&
    typeof value['currency'] === 'string' &&
    typeof value['createdAt'] === 'string'
  );
}

export function isTableStatusChangedEvent(value: unknown): value is TableStatusChangedEvent {
  return (
    isRecord(value) &&
    value['type'] === 'table.status_changed' &&
    typeof value['tableId'] === 'string' &&
    typeof value['status'] === 'string' &&
    TABLE_STATUS_SET.has(value['status']) &&
    typeof value['changedAt'] === 'string'
  );
}

export function isWaiterCalledEvent(value: unknown): value is WaiterCalledEvent {
  return (
    isRecord(value) &&
    value['type'] === 'waiter.called' &&
    typeof value['tableId'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['calledAt'] === 'string' &&
    (value['reason'] === undefined ||
      (typeof value['reason'] === 'string' && WAITER_ALERT_REASON_SET.has(value['reason'])))
  );
}
