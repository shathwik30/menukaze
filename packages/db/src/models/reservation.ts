import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { RESERVATION_STATUSES, type ReservationStatus } from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// `date`, `slotStart`, `slotEnd` are strings in the restaurant's local
// timezone (not UTC instants) so dashboard day-grouping is trivial.

export type { ReservationStatus };

export interface ReservationDoc {
  restaurantId: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  partySize: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  slotStart: string;
  /** HH:mm */
  slotEnd: string;
  notes?: string;
  status: ReservationStatus;
  autoConfirmed: boolean;
  /** Set when a reminder email was sent so the cron does not double-send. */
  reminderSentAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reservationSchema = new Schema<ReservationDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true, maxlength: 200 },
    email: { type: String, required: true, maxlength: 320 },
    phone: { type: String, maxlength: 40 },
    partySize: { type: Number, required: true, min: 1, max: 200 },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    slotStart: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    slotEnd: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    notes: { type: String, maxlength: 500 },
    status: {
      type: String,
      enum: RESERVATION_STATUSES,
      required: true,
      default: 'pending',
    },
    autoConfirmed: { type: Boolean, default: false },
    reminderSentAt: Date,
    cancelReason: { type: String, maxlength: 500 },
  },
  { timestamps: true, collection: 'reservations' },
);

reservationSchema.plugin(tenantScopedPlugin);
reservationSchema.index({ restaurantId: 1, date: 1, slotStart: 1 });
reservationSchema.index({ restaurantId: 1, status: 1, date: 1 });
reservationSchema.index({ restaurantId: 1, email: 1 });

reservationSchema.pre('validate', function () {
  this.email = this.email.toLowerCase();
});

export type ReservationHydratedDoc = HydratedDocument<ReservationDoc>;
export type ReservationModel = Model<ReservationDoc>;

export function reservationModel(connection: Connection): ReservationModel {
  return (
    (connection.models['Reservation'] as ReservationModel | undefined) ??
    connection.model<ReservationDoc>('Reservation', reservationSchema)
  );
}
