import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import {
  PAYMENT_MODE_REQUESTED_OPTIONS,
  TABLE_SESSION_STATUSES,
  type PaymentModeRequested,
  type TableSessionStatusValue,
} from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Status FSM:
//   active → bill_requested → paid → closed   (happy path)
//   active → needs_review                     (timeout sweeper)

export type TableSessionStatus = TableSessionStatusValue;

export interface TableSessionParticipant {
  label: string;
  joinedAt: Date;
}

export interface TableSessionDoc {
  restaurantId: Types.ObjectId;
  tableId: Types.ObjectId;
  status: TableSessionStatus;
  paymentModeRequested?: PaymentModeRequested;

  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  participants: TableSessionParticipant[];

  /** Stable device hash used to rate-limit sessions-per-device in 24h window. */
  deviceFingerprint?: string;
  /** Gate used when firstOrderDelayS hardening is enabled. */
  firstOrderAllowedAt?: Date;

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
      enum: TABLE_SESSION_STATUSES,
      required: true,
      default: 'active',
    },
    paymentModeRequested: { type: String, enum: PAYMENT_MODE_REQUESTED_OPTIONS },
    customer: {
      name: { type: String, required: true, maxlength: 200 },
      email: { type: String, required: true, maxlength: 320 },
      phone: { type: String, maxlength: 40 },
    },
    participants: { type: [participantSchema], default: [] },
    deviceFingerprint: { type: String, maxlength: 64, index: true },
    firstOrderAllowedAt: Date,
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
tableSessionSchema.index({ restaurantId: 1, deviceFingerprint: 1, startedAt: -1 });
tableSessionSchema.index({ status: 1, lastActivityAt: 1 });
tableSessionSchema.index({ restaurantId: 1, 'customer.email': 1, startedAt: -1 });
tableSessionSchema.index({ 'customer.email': 1, startedAt: -1 });

export type TableSessionHydratedDoc = HydratedDocument<TableSessionDoc>;
export type TableSessionModel = Model<TableSessionDoc>;

export function tableSessionModel(connection: Connection): TableSessionModel {
  return (
    (connection.models['TableSession'] as TableSessionModel | undefined) ??
    connection.model<TableSessionDoc>('TableSession', tableSessionSchema)
  );
}
