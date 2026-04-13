import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';

/**
 * Promotional discount code. Applied at subscription checkout to reduce
 * the merchant's bill. Platform-level (not tenant-scoped).
 */

export type PromoCodeType = 'percentage' | 'flat';

export interface PromoCodeDoc {
  /** Unique code (stored uppercase). */
  code: string;
  type: PromoCodeType;
  /** Discount value — percent (0-100) for 'percentage', minor units for 'flat'. */
  value: number;
  /** Max number of redemptions. Null = unlimited. */
  maxUses: number | null;
  currentUses: number;
  expiresAt?: Date;
  /** Restrict to specific plans. Empty = applies to all plans. */
  planIds: Types.ObjectId[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const promoCodeSchema = new Schema<PromoCodeDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, maxlength: 50 },
    type: { type: String, enum: ['percentage', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 },
    maxUses: { type: Number, default: null, min: 1 },
    currentUses: { type: Number, default: 0, min: 0 },
    expiresAt: Date,
    planIds: { type: [Schema.Types.ObjectId], ref: 'Plan', default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'promo_codes' },
);

promoCodeSchema.index({ active: 1, expiresAt: 1 });

export type PromoCodeHydratedDoc = HydratedDocument<PromoCodeDoc>;
export type PromoCodeModel = Model<PromoCodeDoc>;

export function promoCodeModel(connection: Connection): PromoCodeModel {
  return (
    (connection.models['PromoCode'] as PromoCodeModel | undefined) ??
    connection.model<PromoCodeDoc>('PromoCode', promoCodeSchema)
  );
}
