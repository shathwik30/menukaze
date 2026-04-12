import { randomBytes } from 'node:crypto';
import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * A customer order — the canonical record for every purchase on the
 * platform. Orders arrive from five channels (storefront, qr_dinein, kiosk,
 * walk_in, api) and transition through a fixed status FSM driven by dashboard
 * actions, KDS taps, or webhook callbacks.
 *
 * Line items, modifiers, prices, and customer info are all **snapshotted** at
 * order creation time. A menu edit after the fact must never rewrite order
 * history — historical receipts, analytics, and audit trails depend on an
 * immutable record of what the customer actually ordered and paid for.
 *
 * Payment state is embedded on the order (rather than a separate Payment
 * document) because every order has exactly one payment intent. Refunds land
 * as status transitions on that embedded record.
 */

export type OrderChannel = 'storefront' | 'qr_dinein' | 'kiosk' | 'walk_in' | 'api';
export type OrderType = 'dine_in' | 'pickup' | 'delivery';

/**
 * FSM — the canonical statuses every order flows through. Not every status
 * applies to every order type: delivery skips `served`, dine-in skips
 * `out_for_delivery`, etc. The KDS and dashboard handlers enforce which
 * transitions are legal.
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

export type PaymentGateway = 'razorpay' | 'cash';
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface OrderModifierSnapshot {
  groupName: string;
  optionName: string;
  priceMinor: number;
}

export interface OrderLineItem {
  itemId: Types.ObjectId;
  /** Snapshot at order time — future menu edits do not rewrite this. */
  name: string;
  priceMinor: number;
  quantity: number;
  modifiers: OrderModifierSnapshot[];
  notes?: string;
  /** (priceMinor + sum(modifier priceMinor)) * quantity */
  lineTotalMinor: number;
}

export interface OrderStatusEvent {
  status: OrderStatus;
  at: Date;
  /** User who performed the transition (staff members only). */
  byUserId?: Types.ObjectId;
}

export interface OrderPayment {
  gateway: PaymentGateway;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  /** Razorpay order id from `orders.create` (server-side, stable id). */
  razorpayOrderId?: string;
  /** Razorpay payment id returned in the checkout success handler. */
  razorpayPaymentId?: string;
  /** HMAC signature from Razorpay for verification. */
  razorpaySignature?: string;
  paidAt?: Date;
  failureReason?: string;
}

export interface OrderDoc {
  restaurantId: Types.ObjectId;

  /** Human-readable short id shown to customers and on receipts. */
  publicOrderId: string;

  channel: OrderChannel;
  type: OrderType;

  customer: {
    name: string;
    email: string;
    phone?: string;
  };

  items: OrderLineItem[];

  subtotalMinor: number;
  taxMinor: number;
  tipMinor: number;
  totalMinor: number;
  currency: string;

  status: OrderStatus;
  statusHistory: OrderStatusEvent[];

  payment: OrderPayment;

  /** Set for dine-in orders (QR or walk-in). */
  tableId?: Types.ObjectId;
  /** Set for QR dine-in orders that belong to a table session. */
  sessionId?: Types.ObjectId;

  /** Estimated completion time, set when the order is confirmed. */
  estimatedReadyAt?: Date;
  /** Stamped when the order transitions to a terminal status. */
  completedAt?: Date;

  /** Operator-supplied reason for cancellation / refund. Spec §5 line 205. */
  cancelReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate a short human-readable public id, e.g. "MK-7K9F4X".
 * 4 random bytes → 8 base32 chars; we slice to 6 for readability.
 * Uniqueness is enforced by the unique index on (restaurantId, publicOrderId).
 */
export function generatePublicOrderId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return `MK-${out}`;
}

const modifierSnapshotSchema = new Schema<OrderModifierSnapshot>(
  {
    groupName: { type: String, required: true },
    optionName: { type: String, required: true },
    priceMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const lineItemSchema = new Schema<OrderLineItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    name: { type: String, required: true },
    priceMinor: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    modifiers: { type: [modifierSnapshotSchema], default: [] },
    notes: { type: String, maxlength: 500 },
    lineTotalMinor: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const statusEventSchema = new Schema<OrderStatusEvent>(
  {
    status: { type: String, required: true },
    at: { type: Date, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const paymentSchema = new Schema<OrderPayment>(
  {
    gateway: { type: String, enum: ['razorpay', 'cash'], required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded'],
      required: true,
      default: 'pending',
    },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, minlength: 3, maxlength: 3 },
    razorpayOrderId: { type: String, index: true, sparse: true },
    razorpayPaymentId: String,
    razorpaySignature: String,
    paidAt: Date,
    failureReason: String,
  },
  { _id: false },
);

const ORDER_STATUSES: OrderStatus[] = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'served',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
];

const orderSchema = new Schema<OrderDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    publicOrderId: { type: String, required: true },

    channel: {
      type: String,
      enum: ['storefront', 'qr_dinein', 'kiosk', 'walk_in', 'api'],
      required: true,
    },
    type: { type: String, enum: ['dine_in', 'pickup', 'delivery'], required: true },

    customer: {
      name: { type: String, required: true, maxlength: 200 },
      email: { type: String, required: true, maxlength: 320 },
      phone: { type: String, maxlength: 40 },
    },

    items: { type: [lineItemSchema], required: true, validate: (v: unknown[]) => v.length > 0 },

    subtotalMinor: { type: Number, required: true, min: 0 },
    taxMinor: { type: Number, required: true, min: 0, default: 0 },
    tipMinor: { type: Number, required: true, min: 0, default: 0 },
    totalMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, minlength: 3, maxlength: 3 },

    status: { type: String, enum: ORDER_STATUSES, required: true, default: 'received' },
    statusHistory: { type: [statusEventSchema], default: [] },

    payment: { type: paymentSchema, required: true },

    tableId: { type: Schema.Types.ObjectId, ref: 'Table' },
    sessionId: { type: Schema.Types.ObjectId, ref: 'TableSession' },

    estimatedReadyAt: Date,
    completedAt: Date,
    cancelReason: { type: String, maxlength: 500 },
  },
  { timestamps: true, collection: 'orders' },
);

orderSchema.plugin(tenantScopedPlugin);
orderSchema.index({ restaurantId: 1, publicOrderId: 1 }, { unique: true });
orderSchema.index({ restaurantId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, sessionId: 1 });

export type OrderHydratedDoc = HydratedDocument<OrderDoc>;
export type OrderModel = Model<OrderDoc>;

export function orderModel(connection: Connection): OrderModel {
  return (
    (connection.models['Order'] as OrderModel | undefined) ??
    connection.model<OrderDoc>('Order', orderSchema)
  );
}
