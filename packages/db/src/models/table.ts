import { randomBytes } from 'node:crypto';
import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { TABLE_STATUSES, type TableStatus } from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Status flow: available → occupied → bill_requested → paid → available.
// Timeout / unpaid edge cases → needs_review.

export type { TableStatus };

export interface TableDoc {
  restaurantId: Types.ObjectId;
  number: number;
  name: string;
  capacity: number;
  zone?: string;
  qrToken: string;
  status: TableStatus;
  lastReleasedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 18 random bytes → 24 base64url chars → ~144 bits of entropy.
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
      enum: TABLE_STATUSES,
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
