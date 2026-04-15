import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';

/**
 * Platform-generated invoice for a restaurant's billing period.
 * Covers subscription fee + commission on orders. Platform-level (not tenant-scoped).
 */

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export interface InvoiceLineItem {
  description: string;
  amountMinor: number;
  quantity: number;
}

export interface DunningAttempt {
  attemptedAt: Date;
  succeeded: boolean;
  failureReason?: string;
}

export interface InvoiceDoc {
  restaurantId: Types.ObjectId;
  /** Human-readable invoice number, e.g. "INV-2026-0001". */
  number: string;
  lineItems: InvoiceLineItem[];
  totalMinor: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  status: InvoiceStatus;
  dueAt: Date;
  paidAt?: Date;
  dunningAttempts: DunningAttempt[];
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<InvoiceDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    number: { type: String, required: true, unique: true },
    lineItems: {
      type: [
        {
          description: { type: String, required: true },
          amountMinor: { type: Number, required: true },
          quantity: { type: Number, required: true, default: 1 },
        },
      ],
      default: [],
    },
    totalMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, minlength: 3, maxlength: 3 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'void'],
      default: 'draft',
    },
    dueAt: { type: Date, required: true },
    paidAt: Date,
    dunningAttempts: {
      type: [
        {
          attemptedAt: { type: Date, required: true },
          succeeded: { type: Boolean, required: true },
          failureReason: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true, collection: 'invoices' },
);

invoiceSchema.index({ restaurantId: 1, periodStart: -1 });
invoiceSchema.index({ status: 1, dueAt: 1 });
invoiceSchema.index({ status: 1, createdAt: -1 });
invoiceSchema.index({ createdAt: -1 });

export type InvoiceHydratedDoc = HydratedDocument<InvoiceDoc>;
export type InvoiceModel = Model<InvoiceDoc>;

export function invoiceModel(connection: Connection): InvoiceModel {
  return (
    (connection.models['Invoice'] as InvoiceModel | undefined) ??
    connection.model<InvoiceDoc>('Invoice', invoiceSchema)
  );
}
