import { randomBytes } from 'node:crypto';
import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * A dine-in Table. Every table has a unique `qrToken` encoded in its printed
 * QR sticker; scanning the QR points the customer at
 * `{slug}.menukaze.com/t/{qrToken}` to start a dine-in session.
 *
 * Status FSM (spec §5 Table Management):
 *   available → occupied → bill_requested → paid → available
 *   (or → needs_review for timeout / unpaid edge cases)
 */
export type TableStatus = 'available' | 'occupied' | 'bill_requested' | 'paid' | 'needs_review';

export interface TableDoc {
  restaurantId: Types.ObjectId;
  /** Sequence number for display (Table 1, Table 2, …). Unique per restaurant. */
  number: number;
  /** Display name. Defaults to "Table {number}" on creation; editable later. */
  name: string;
  /** Seating capacity. Defaults to 4. */
  capacity: number;
  /** Optional zone tag — indoor, outdoor, bar, private dining. */
  zone?: string;
  /** Random 24-char URL-safe token encoded in the printed QR sticker. */
  qrToken: string;
  status: TableStatus;
  lastReleasedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate a cryptographically random URL-safe token for a table's QR code.
 * 18 random bytes → 24 base64url characters → ~144 bits of entropy.
 */
export function generateQrToken(): string {
  return randomBytes(18).toString('base64url');
}

const tableSchema = new Schema<TableDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    number: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, maxlength: 120 },
    capacity: { type: Number, required: true, min: 1, default: 4 },
    zone: String,
    qrToken: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['available', 'occupied', 'bill_requested', 'paid', 'needs_review'],
      default: 'available',
    },
    lastReleasedAt: Date,
  },
  { timestamps: true, collection: 'tables' },
);

tableSchema.plugin(tenantScopedPlugin);
tableSchema.index({ restaurantId: 1, number: 1 }, { unique: true });
tableSchema.index({ restaurantId: 1, status: 1 });

export type TableHydratedDoc = HydratedDocument<TableDoc>;
export type TableModel = Model<TableDoc>;

export function tableModel(connection: Connection): TableModel {
  return (
    (connection.models['Table'] as TableModel | undefined) ??
    connection.model<TableDoc>('Table', tableSchema)
  );
}
