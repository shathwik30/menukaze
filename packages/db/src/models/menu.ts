import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * A menu is the top-level container for a restaurant's offerings, such as
 * "Breakfast Menu", "Lunch Menu", "Weekend Brunch". A restaurant has at
 * least one menu and may schedule multiple menus to swap by time of day.
 *
 * Categories live under a menu; items live under a category.
 */
export interface MenuDoc {
  restaurantId: Types.ObjectId;
  name: string;
  /** Sort order within the restaurant's menu list. Lower = earlier. */
  order: number;
  /** Optional schedule. Empty means the menu is always active. */
  schedule?: {
    days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
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
      days: { type: [String], enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
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
