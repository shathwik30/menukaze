import { Schema, Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * A menu Item — what a customer actually orders. Modifiers are embedded
 * (read-heavy, always fetched with the item) and snapshot at order time so
 * future menu edits never rewrite history.
 *
 * Phase 4 step 4 ships the minimum viable item: name + price + dietary tags.
 * Phase 4 step 15 (Menu Management Dashboard) extends this with image upload,
 * combo bundles, scheduled menus, multi-language names, etc.
 */
export interface ItemModifierOption {
  _id?: Types.ObjectId;
  name: string;
  /** Extra cost in minor units. Always integer. */
  priceMinor: number;
}

export interface ItemModifierGroup {
  _id?: Types.ObjectId;
  name: string;
  /** Customer must pick at least one option. */
  required: boolean;
  /** Maximum number of options the customer can pick. 0 = unlimited. */
  max: number;
  options: ItemModifierOption[];
}

export interface ItemDoc {
  restaurantId: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  description?: string;
  /** Always integer minor units (cents/paise/etc). */
  priceMinor: number;
  /** ISO 4217 — duplicated from the parent restaurant for snapshot safety. */
  currency: string;
  imageUrl?: string;
  dietaryTags: string[];
  modifiers: ItemModifierGroup[];
  /** Real-time availability toggle (Step 5 sold-out toggle). */
  soldOut: boolean;
  ageRestricted?: boolean;
  /** Optional KDS station override — falls back to category.stationIds. */
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
    soldOut: { type: Boolean, default: false },
    ageRestricted: Boolean,
    stationIds: { type: [Schema.Types.ObjectId], default: undefined },
  },
  { timestamps: true, collection: 'items' },
);

itemSchema.plugin(tenantScopedPlugin);
itemSchema.index({ restaurantId: 1, categoryId: 1, soldOut: 1 });
itemSchema.index({ restaurantId: 1, name: 'text', description: 'text' });

export type ItemHydratedDoc = HydratedDocument<ItemDoc>;
export type ItemModel = Model<ItemDoc>;

export function itemModel(connection: Connection): ItemModel {
  return (
    (connection.models['Item'] as ItemModel | undefined) ??
    connection.model<ItemDoc>('Item', itemSchema)
  );
}
