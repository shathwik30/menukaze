export const ORDER_STATUSES = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'served',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const ORDER_STATUS_SET: ReadonlySet<string> = new Set(ORDER_STATUSES);

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && ORDER_STATUS_SET.has(value);
}

export const TERMINAL_ORDER_STATUSES = ['completed', 'cancelled'] as const;
export const TERMINAL_ORDER_STATUS_SET: ReadonlySet<OrderStatus> = new Set(TERMINAL_ORDER_STATUSES);

export function isTerminalOrderStatus(value: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUS_SET.has(value);
}

export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  received: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'out_for_delivery', 'completed', 'cancelled'],
  served: ['completed'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export const ORDER_LINE_STATUSES = ['received', 'preparing', 'ready'] as const;
export type OrderLineStatus = (typeof ORDER_LINE_STATUSES)[number];

export const ORDER_STATUS_TRANSITION_LABELS: Readonly<Record<OrderStatus, string>> = {
  received: 'Receive',
  confirmed: 'Confirm',
  preparing: 'Start preparing',
  ready: 'Mark ready',
  served: 'Mark served',
  out_for_delivery: 'Out for delivery',
  delivered: 'Mark delivered',
  completed: 'Complete',
  cancelled: 'Cancel',
};

export const ORDER_CHANNELS = ['storefront', 'qr_dinein', 'kiosk', 'walk_in', 'api'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

const ORDER_CHANNEL_SET: ReadonlySet<string> = new Set(ORDER_CHANNELS);
export function isOrderChannel(value: unknown): value is OrderChannel {
  return typeof value === 'string' && ORDER_CHANNEL_SET.has(value);
}

export const BUILT_IN_ORDER_CHANNELS: ReadonlySet<OrderChannel> = new Set([
  'storefront',
  'qr_dinein',
  'kiosk',
  'walk_in',
]);

export type OrderChannelKind = 'built_in' | 'api';

export function orderChannelKind(channel: OrderChannel): OrderChannelKind {
  return BUILT_IN_ORDER_CHANNELS.has(channel) ? 'built_in' : 'api';
}

export const ORDER_TYPES = ['dine_in', 'pickup', 'delivery'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const PAYMENT_GATEWAYS = ['razorpay', 'cash'] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const TABLE_STATUSES = [
  'available',
  'occupied',
  'bill_requested',
  'paid',
  'needs_review',
] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

const TABLE_STATUS_SET: ReadonlySet<string> = new Set(TABLE_STATUSES);
export function isTableStatus(value: unknown): value is TableStatus {
  return typeof value === 'string' && TABLE_STATUS_SET.has(value);
}

export const TABLE_STATUS_REASONS = [
  'session_started',
  'bill_requested',
  'payment_succeeded',
  'table_released',
  'timeout_unpaid',
] as const;
export type TableStatusReason = (typeof TABLE_STATUS_REASONS)[number];

export const WAITER_ALERT_REASONS = ['call_waiter', 'payment_help'] as const;
export type WaiterAlertReason = (typeof WAITER_ALERT_REASONS)[number];

const WAITER_ALERT_REASON_SET: ReadonlySet<string> = new Set(WAITER_ALERT_REASONS);
export function isWaiterAlertReason(value: unknown): value is WaiterAlertReason {
  return typeof value === 'string' && WAITER_ALERT_REASON_SET.has(value);
}

export const SESSION_UPDATE_REASONS = [
  'participant_joined',
  'round_added',
  'bill_requested',
  'payment_succeeded',
  'closed',
  'needs_review',
] as const;
export type SessionUpdateReason = (typeof SESSION_UPDATE_REASONS)[number];

export const TABLE_SESSION_STATUSES = [
  'active',
  'bill_requested',
  'paid',
  'closed',
  'needs_review',
] as const;
export type TableSessionStatusValue = (typeof TABLE_SESSION_STATUSES)[number];

export const RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'seated',
  'no_show',
  'completed',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STAFF_ROLES = ['owner', 'manager', 'waiter', 'kitchen', 'cashier', 'custom'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_MEMBERSHIP_STATUSES = ['active', 'deactivated'] as const;
export type StaffMembershipStatus = (typeof STAFF_MEMBERSHIP_STATUSES)[number];

export const API_KEY_SCOPES = ['read_only', 'read_write', 'admin'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_ENVS = ['live', 'test'] as const;
export type ApiKeyEnv = (typeof API_KEY_ENVS)[number];

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const PAYMENT_MODE_REQUESTED_OPTIONS = ['online', 'counter'] as const;
export type PaymentModeRequested = (typeof PAYMENT_MODE_REQUESTED_OPTIONS)[number];

export const DEFAULT_PREP_MINUTES = 20;

/**
 * Estimate the prep time (in minutes) the kitchen needs for a whole cart.
 * Uses the *max* of the line items' per-item prep times (parallel prep on
 * separate stations is the norm), falling back to the restaurant-level
 * default for items that don't have one set.
 */
export function computeCartPrepMinutes(
  lines: ReadonlyArray<{ estimatedPrepMinutes?: number | null }>,
  restaurantDefault: number = DEFAULT_PREP_MINUTES,
): number {
  let maxMinutes = 0;
  let hadAnyItemValue = false;
  for (const line of lines) {
    const v = line.estimatedPrepMinutes;
    if (typeof v === 'number' && v > 0) {
      hadAnyItemValue = true;
      if (v > maxMinutes) maxMinutes = v;
    }
  }
  if (!hadAnyItemValue) return restaurantDefault;
  // Some items have a value, others don't; take the larger of the per-item
  // max and the restaurant default so items without a value still contribute.
  return Math.max(maxMinutes, restaurantDefault);
}

export const SESSION_FAST_FOLLOW_MS = 90_000;
export const SESSION_PLAUSIBLE_CAP_PER_SEAT_MINOR = 50_000;
export const SESSION_PLAUSIBLE_CAP_MULTIPLIER = 4;
