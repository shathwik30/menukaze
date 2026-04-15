import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * A category groups items within a menu, such as "Appetizers", "Mains", or "Desserts".
 * Items have a categoryId pointing here. The category's stationIds drive
 * which KDS stations the items get routed to.
 */
export interface CategoryDoc {
  restaurantId: Types.ObjectId;
  menuId: Types.ObjectId;
  name: string;
  /** Sort order within the parent menu. Lower = earlier. */
  order: number;
  /** Optional KDS station routing. Empty or missing means default station. */
  stationIds?: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    menuId: { type: Schema.Types.ObjectId, ref: 'Menu', required: true },
    name: { type: String, required: true, maxlength: 120 },
    order: { type: Number, default: 0 },
    stationIds: { type: [Schema.Types.ObjectId], default: undefined },
  },
  { timestamps: true, collection: 'categories' },
);

categorySchema.plugin(tenantScopedPlugin);
categorySchema.index({ restaurantId: 1, menuId: 1, order: 1 });
categorySchema.index({ restaurantId: 1, order: 1 });

export type CategoryHydratedDoc = HydratedDocument<CategoryDoc>;
export type CategoryModel = Model<CategoryDoc>;

export function categoryModel(connection: Connection): CategoryModel {
  return (
    (connection.models['Category'] as CategoryModel | undefined) ??
    connection.model<CategoryDoc>('Category', categorySchema)
  );
}
