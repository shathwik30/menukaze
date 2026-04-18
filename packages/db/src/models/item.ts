import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Modifiers are embedded (read-heavy, always fetched with the item).
// Orders snapshot these at creation time so future menu edits never rewrite history.

export interface ItemModifierOption {
  _id?: Types.ObjectId;
  name: string;
  priceMinor: number;
}

export interface ItemModifierGroup {
  _id?: Types.ObjectId;
  name: string;
  required: boolean;
  /** 0 = unlimited. */
  max: number;
  options: ItemModifierOption[];
}

export interface ItemDoc {
  restaurantId: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  description?: string;
  priceMinor: number;
  /** Snapshot from the parent restaurant to keep items self-describing. */
  currency: string;
  imageUrl?: string;
  dietaryTags: string[];
  modifiers: ItemModifierGroup[];
  comboOf?: Types.ObjectId[];
  soldOut: boolean;
  ageRestricted?: boolean;
  /** Override for category.stationIds. */
  stationIds?: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const itemModifierOptionSchema = new Schema<ItemModifierOption>(
  {
    name: { type: String, required: true, maxlength: 120 },
    priceMinor: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const itemModifierGroupSchema = new Schema<ItemModifierGroup>(
  {
    name: { type: String, required: true, maxlength: 120 },
    required: { type: Boolean, default: false },
    max: { type: Number, default: 0, min: 0 },
    options: { type: [itemModifierOptionSchema], default: [] },
  },
  { _id: true },
);

const itemSchema = new Schema<ItemDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    priceMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, minlength: 3, maxlength: 3 },
    imageUrl: String,
    dietaryTags: { type: [String], default: [] },
    modifiers: { type: [itemModifierGroupSchema], default: [] },
    comboOf: { type: [Schema.Types.ObjectId], default: undefined },
    soldOut: { type: Boolean, default: false },
    ageRestricted: Boolean,
    stationIds: { type: [Schema.Types.ObjectId], default: undefined },
  },
  { timestamps: true, collection: 'items' },
);

itemSchema.plugin(tenantScopedPlugin);
itemSchema.index({ restaurantId: 1, categoryId: 1, soldOut: 1 });
itemSchema.index({ restaurantId: 1, createdAt: 1 });
itemSchema.index({ restaurantId: 1, name: 'text', description: 'text' });

export type ItemHydratedDoc = HydratedDocument<ItemDoc>;
export type ItemModel = Model<ItemDoc>;

export function itemModel(connection: Connection): ItemModel {
  return (
    (connection.models['Item'] as ItemModel | undefined) ??
    connection.model<ItemDoc>('Item', itemSchema)
  );
}
