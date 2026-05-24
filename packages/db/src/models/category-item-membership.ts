import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

export interface CategoryItemMembershipDoc {
  restaurantId: Types.ObjectId;
  categoryId: Types.ObjectId;
  itemId: Types.ObjectId;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const categoryItemMembershipSchema = new Schema<CategoryItemMembershipDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'category_item_memberships' },
);

categoryItemMembershipSchema.plugin(tenantScopedPlugin);
categoryItemMembershipSchema.index({ restaurantId: 1, categoryId: 1, order: 1, itemId: 1 });
categoryItemMembershipSchema.index({ restaurantId: 1, itemId: 1, categoryId: 1 }, { unique: true });

export type CategoryItemMembershipHydratedDoc = HydratedDocument<CategoryItemMembershipDoc>;
export type CategoryItemMembershipModel = Model<CategoryItemMembershipDoc>;

export function categoryItemMembershipModel(connection: Connection): CategoryItemMembershipModel {
  return (
    (connection.models['CategoryItemMembership'] as CategoryItemMembershipModel | undefined) ??
    connection.model<CategoryItemMembershipDoc>(
      'CategoryItemMembership',
      categoryItemMembershipSchema,
    )
  );
}
