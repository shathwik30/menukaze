import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';

export type PromoCodeType = 'percentage' | 'flat';

export interface PromoCodeDoc {
  code: string;
  type: PromoCodeType;
  /** Percent (0-100) when type=percentage; minor units when type=flat. */
  value: number;
  /** null = unlimited. */
  maxUses: number | null;
  currentUses: number;
  expiresAt?: Date;
  /** Empty = applies to all plans. */
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
