import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * A QR dine-in session. Begins when a customer scans a table QR code and
 * enters their details; ends when the bill is paid (or when a timeout
 * sweeper marks it `needs_review`). Contains zero or more rounds, each of
 * which is an `Order` document with this session's `_id` stamped on its
 * `sessionId` field.
 *
 * Session state FSM:
 *   active          — customers still ordering
 *   bill_requested  — customer pressed "Request bill"; no more rounds
 *   paid            — payment succeeded, sweeper will close
 *   closed          — terminal, table returned to available
 *   needs_review    — terminal, unpaid after timeout
 */

export type TableSessionStatus = 'active' | 'bill_requested' | 'paid' | 'closed' | 'needs_review';

export interface TableSessionParticipant {
  label: string;
  joinedAt: Date;
}

export interface TableSessionDoc {
  restaurantId: Types.ObjectId;
  tableId: Types.ObjectId;
  status: TableSessionStatus;

  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  /** Optional participant labels for group ordering (Step 23). */
  participants: TableSessionParticipant[];

  startedAt: Date;
  closedAt?: Date;
  billRequestedAt?: Date;
  paidAt?: Date;
  lastActivityAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const participantSchema = new Schema<TableSessionParticipant>(
  {
    label: { type: String, required: true, maxlength: 60 },
    joinedAt: { type: Date, required: true },
  },
  { _id: false },
);

const tableSessionSchema = new Schema<TableSessionDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    status: {
      type: String,
      enum: ['active', 'bill_requested', 'paid', 'closed', 'needs_review'],
      required: true,
      default: 'active',
    },
    customer: {
      name: { type: String, required: true, maxlength: 200 },
      email: { type: String, required: true, maxlength: 320 },
      phone: { type: String, maxlength: 40 },
    },
    participants: { type: [participantSchema], default: [] },
    startedAt: { type: Date, required: true },
    closedAt: Date,
    billRequestedAt: Date,
    paidAt: Date,
    lastActivityAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'table_sessions' },
);

tableSessionSchema.plugin(tenantScopedPlugin);
tableSessionSchema.index({ restaurantId: 1, tableId: 1, status: 1 });
tableSessionSchema.index({ restaurantId: 1, status: 1, lastActivityAt: 1 });

export type TableSessionHydratedDoc = HydratedDocument<TableSessionDoc>;
export type TableSessionModel = Model<TableSessionDoc>;

export function tableSessionModel(connection: Connection): TableSessionModel {
  return (
    (connection.models['TableSession'] as TableSessionModel | undefined) ??
    connection.model<TableSessionDoc>('TableSession', tableSessionSchema)
  );
}
