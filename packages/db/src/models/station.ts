import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * A KDS station. Each restaurant runs zero or more stations (grill, fry,
 * salads, drinks, bar). Items and categories may be assigned to one or more
 * stations via `stationIds`; the KDS view filters by station so the screen
 * in front of the grill only shows what the grill needs to cook.
 *
 * When a restaurant has no stations configured, the KDS shows the full feed
 * — the single-station behaviour the platform shipped with.
 */

export interface StationDoc {
  restaurantId: Types.ObjectId;
  name: string;
  /** Sort order in the dashboard list. */
  order: number;
  /** Tailwind colour token for the badge / card border on the KDS. */
  color?: string;
  /** Optional sound preference key for the audio alert per station. */
  soundEnabled: boolean;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const stationSchema = new Schema<StationDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true, maxlength: 120 },
    order: { type: Number, default: 0 },
    color: { type: String, maxlength: 32 },
    soundEnabled: { type: Boolean, default: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'stations' },
);

stationSchema.plugin(tenantScopedPlugin);
stationSchema.index({ restaurantId: 1, archived: 1, order: 1 });

export type StationHydratedDoc = HydratedDocument<StationDoc>;
export type StationModel = Model<StationDoc>;

export function stationModel(connection: Connection): StationModel {
  return (
    (connection.models['Station'] as StationModel | undefined) ??
    connection.model<StationDoc>('Station', stationSchema)
  );
}
