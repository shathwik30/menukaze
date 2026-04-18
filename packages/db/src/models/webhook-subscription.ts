import { randomBytes } from 'node:crypto';
import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Platform signs every delivery with HMAC-SHA256 using the subscription's `secret`.
// Disabling suspends future deliveries without deleting the subscription.

export interface WebhookSubscriptionDoc {
  restaurantId: Types.ObjectId;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  description?: string;
  createdByUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const webhookSubscriptionSchema = new Schema<WebhookSubscriptionDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    url: { type: String, required: true, maxlength: 2048 },
    events: { type: [String], default: [] },
    secret: { type: String, required: true, maxlength: 128 },
    enabled: { type: Boolean, default: true },
    description: { type: String, maxlength: 200 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'webhook_subscriptions' },
);

webhookSubscriptionSchema.plugin(tenantScopedPlugin);
webhookSubscriptionSchema.index({ restaurantId: 1, enabled: 1 });
webhookSubscriptionSchema.index({ restaurantId: 1, events: 1 });
webhookSubscriptionSchema.index({ restaurantId: 1, createdAt: -1 });

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export type WebhookSubscriptionHydratedDoc = HydratedDocument<WebhookSubscriptionDoc>;
export type WebhookSubscriptionModel = Model<WebhookSubscriptionDoc>;

export function webhookSubscriptionModel(connection: Connection): WebhookSubscriptionModel {
  return (
    (connection.models['WebhookSubscription'] as WebhookSubscriptionModel | undefined) ??
    connection.model<WebhookSubscriptionDoc>('WebhookSubscription', webhookSubscriptionSchema)
  );
}
