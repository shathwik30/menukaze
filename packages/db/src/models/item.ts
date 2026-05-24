import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import {
  ALLERGENS,
  ORDER_CHANNELS,
  WEEKDAYS,
  type Allergen,
  type OrderChannel,
  type Weekday,
} from '@menukaze/shared';
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
  min: number;
  /** 0 = unlimited. */
  max: number;
  options: ItemModifierOption[];
}

export interface ItemVariant {
  _id?: Types.ObjectId;
  name: string;
  priceMinor: number;
  order: number;
  isDefault: boolean;
  soldOut?: boolean;
}

export interface ItemDoc {
  restaurantId: Types.ObjectId;
  /** Legacy single-category field retained temporarily for compatibility. */
  categoryId: Types.ObjectId;
  name: string;
  description?: string;
  priceMinor: number;
  /** Snapshot from the parent restaurant to keep items self-describing. */
  currency: string;
  imageUrl?: string;
  dietaryTags: string[];
  allergens: Allergen[];
  modifiers: ItemModifierGroup[];
  variants: ItemVariant[];
  soldOut: boolean;
  status: 'draft' | 'published';
  isHidden: boolean;
  availableFor?: OrderChannel[];
  schedule?: {
    days: Weekday[];
    startTime: string;
    endTime: string;
  };
  taxClassId?: string;
  featured: boolean;
  searchKeywords: string[];
  ageRestricted?: boolean;
  /** Override for category.stationIds. */
  stationIds?: Types.ObjectId[];
  /**
   * Optional per-item prep time (minutes). Cart-level estimates take the
   * maximum of line items' prep times so a slow dish isn't hidden by fast
   * ones; falls back to `Restaurant.estimatedPrepMinutes` when unset.
   */
  estimatedPrepMinutes?: number;
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
    min: { type: Number, default: 0, min: 0 },
    max: { type: Number, default: 0, min: 0 },
    options: { type: [itemModifierOptionSchema], default: [] },
  },
  { _id: true },
);

const itemVariantSchema = new Schema<ItemVariant>(
  {
    name: { type: String, required: true, maxlength: 120 },
    priceMinor: { type: Number, required: true, min: 0 },
    order: { type: Number, required: true, default: 0, min: 0 },
    isDefault: { type: Boolean, default: false },
    soldOut: { type: Boolean, default: false },
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
    allergens: { type: [String], enum: ALLERGENS, default: [] },
    modifiers: { type: [itemModifierGroupSchema], default: [] },
    variants: { type: [itemVariantSchema], default: [] },
    soldOut: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    isHidden: { type: Boolean, default: false },
    availableFor: { type: [String], enum: ORDER_CHANNELS, default: undefined },
    schedule: {
      days: { type: [String], enum: WEEKDAYS },
      startTime: String,
      endTime: String,
    },
    taxClassId: { type: String, maxlength: 64 },
    featured: { type: Boolean, default: false },
    searchKeywords: { type: [String], default: [] },
    ageRestricted: Boolean,
    stationIds: { type: [Schema.Types.ObjectId], default: undefined },
    estimatedPrepMinutes: { type: Number, min: 0, max: 600 },
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
