import { randomBytes } from 'node:crypto';
import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import {
  ORDER_CHANNELS,
  ORDER_LINE_STATUSES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_GATEWAYS,
  PAYMENT_STATUSES,
  type OrderChannel,
  type OrderLineStatus,
  type OrderStatus,
  type OrderType,
  type PaymentGateway,
  type PaymentStatus,
} from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Line items, modifiers, prices, and customer info are snapshotted at order
// creation. A menu edit after the fact must never rewrite order history —
// receipts, analytics, and audit depend on an immutable record.
// Payment state is embedded (one intent per order); refunds are transitions
// on that embedded record.

export type {
  OrderChannel,
  OrderLineStatus,
  OrderStatus,
  OrderType,
  PaymentGateway,
  PaymentStatus,
};

export interface OrderModifierSnapshot {
  groupName: string;
  optionName: string;
  priceMinor: number;
}

export interface OrderLineItem {
  _id?: Types.ObjectId;
  itemId: Types.ObjectId;
  name: string;
  priceMinor: number;
  quantity: number;
  modifiers: OrderModifierSnapshot[];
  notes?: string;
  /** (priceMinor + sum(modifier priceMinor)) * quantity */
  lineTotalMinor: number;
  stationId?: Types.ObjectId;
  lineStatus?: OrderLineStatus;
}

export interface OrderStatusEvent {
  status: OrderStatus;
  at: Date;
  byUserId?: Types.ObjectId;
}

export interface OrderPayment {
  gateway: PaymentGateway;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  methodLabel?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paidAt?: Date;
  failureReason?: string;
}

export interface OrderDoc {
  restaurantId: Types.ObjectId;

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

  tableId?: Types.ObjectId;
  sessionId?: Types.ObjectId;

  estimatedReadyAt?: Date;
  completedAt?: Date;

  cancelReason?: string;

  /** Set by the QR anomaly engine; dashboard shows a review banner but orders still flow to KDS. */
  suspicious?: boolean;
  suspiciousReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

// Human-readable id like "MK-7K9F4X". Alphabet omits 0/O/1/I/L for legibility.
// Uniqueness enforced by the (restaurantId, publicOrderId) unique index.
export function generatePublicOrderId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
    stationId: { type: Schema.Types.ObjectId, ref: 'Station' },
    lineStatus: {
      type: String,
      enum: ORDER_LINE_STATUSES,
      required: true,
      default: 'received',
    },
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
    gateway: { type: String, enum: PAYMENT_GATEWAYS, required: true },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      required: true,
      default: 'pending',
    },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, minlength: 3, maxlength: 3 },
    methodLabel: String,
    razorpayOrderId: { type: String, index: true, sparse: true },
    razorpayPaymentId: String,
    razorpaySignature: String,
    paidAt: Date,
    failureReason: String,
  },
  { _id: false },
);

const orderSchema = new Schema<OrderDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    publicOrderId: { type: String, required: true },

    channel: {
      type: String,
      enum: ORDER_CHANNELS,
      required: true,
    },
    type: { type: String, enum: ORDER_TYPES, required: true },

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
    suspicious: { type: Boolean, default: false },
    suspiciousReason: { type: String, maxlength: 200 },
  },
  { timestamps: true, collection: 'orders' },
);

orderSchema.plugin(tenantScopedPlugin);
orderSchema.index({ restaurantId: 1, publicOrderId: 1 }, { unique: true });
orderSchema.index({ restaurantId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, sessionId: 1 });
orderSchema.index({ restaurantId: 1, 'customer.email': 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'customer.email': 1, createdAt: -1 });

export type OrderHydratedDoc = HydratedDocument<OrderDoc>;
export type OrderModel = Model<OrderDoc>;

export function orderModel(connection: Connection): OrderModel {
  return (
    (connection.models['Order'] as OrderModel | undefined) ??
    connection.model<OrderDoc>('Order', orderSchema)
  );
}
