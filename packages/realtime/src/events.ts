/**
 * Real-time event payload contracts.
 *
 * Every realtime message is one of these envelopes. Server publishes are
 * typed against `RealtimeEvent`, so the browser can pattern-match on
 * `event.type` to a fully typed payload.
 *
 * The status enums (`OrderStatus`, `TableStatus`, `WaiterAlertReason`,
 * `SessionUpdateReason`, `TableStatusReason`) live in `@menukaze/shared`
 * and are re-exported here so dashboards, KDS, and customer apps can
 * import them from a single realtime module.
 */

import {
  isOrderStatus,
  isTableStatus,
  isWaiterAlertReason,
  type OrderStatus,
  type SessionUpdateReason,
  type TableStatus,
  type TableStatusReason,
  type WaiterAlertReason,
} from '@menukaze/shared';

export type { OrderStatus, TableStatus, TableStatusReason, WaiterAlertReason, SessionUpdateReason };
export { isOrderStatus };

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

export interface TableStatusChangedEvent {
  type: 'table.status_changed';
  tableId: string;
  status: TableStatus;
  changedAt: string;
  reason?: TableStatusReason;
}

export interface WaiterCalledEvent {
  type: 'waiter.called';
  tableId: string;
  sessionId: string;
  calledAt: string;
  reason?: WaiterAlertReason;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
    isTableStatus(value['status']) &&
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
    (value['reason'] === undefined || isWaiterAlertReason(value['reason']))
  );
}
