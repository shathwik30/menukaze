import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * Post-order customer feedback. One feedback per order. Rating 1–5 + an
 * optional free-text comment. Surfaced on the dashboard and aggregated by
 * the analytics module.
 */

export interface FeedbackDoc {
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  rating: number;
  comment?: string;
  customerEmail?: string;
  customerName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const feedbackSchema = new Schema<FeedbackDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 2000 },
    customerEmail: { type: String, maxlength: 320 },
    customerName: { type: String, maxlength: 200 },
  },
  { timestamps: true, collection: 'feedback' },
);

feedbackSchema.plugin(tenantScopedPlugin);
feedbackSchema.index({ restaurantId: 1, createdAt: -1 });
feedbackSchema.index({ restaurantId: 1, orderId: 1 }, { unique: true });
feedbackSchema.index({ restaurantId: 1, rating: 1 });

export type FeedbackHydratedDoc = HydratedDocument<FeedbackDoc>;
export type FeedbackModel = Model<FeedbackDoc>;

export function feedbackModel(connection: Connection): FeedbackModel {
  return (
    (connection.models['Feedback'] as FeedbackModel | undefined) ??
    connection.model<FeedbackDoc>('Feedback', feedbackSchema)
  );
}
