import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { WEEKDAYS, type Weekday } from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

export interface MenuDoc {
  restaurantId: Types.ObjectId;
  name: string;
  order: number;
  /** Empty = always active. */
  schedule?: {
    days: Weekday[];
    startTime: string;
    endTime: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const menuSchema = new Schema<MenuDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true, maxlength: 120 },
    order: { type: Number, default: 0 },
    schedule: {
      days: { type: [String], enum: WEEKDAYS },
      startTime: String,
      endTime: String,
    },
  },
  { timestamps: true, collection: 'menus' },
);

menuSchema.plugin(tenantScopedPlugin);
menuSchema.index({ restaurantId: 1, order: 1 });

export type MenuHydratedDoc = HydratedDocument<MenuDoc>;
export type MenuModel = Model<MenuDoc>;

export function menuModel(connection: Connection): MenuModel {
  return (
    (connection.models['Menu'] as MenuModel | undefined) ??
    connection.model<MenuDoc>('Menu', menuSchema)
  );
}
