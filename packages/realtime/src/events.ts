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
