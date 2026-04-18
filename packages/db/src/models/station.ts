import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// When a restaurant has no stations configured, the KDS shows the full feed.

export interface StationDoc {
  restaurantId: Types.ObjectId;
  name: string;
  order: number;
  color?: string;
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
