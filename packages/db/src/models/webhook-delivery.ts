import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// Retry schedule: 1m → 5m → 30m → 2h → 24h → permanent fail (5 attempts total).

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface WebhookDeliveryDoc {
  restaurantId: Types.ObjectId;
  subscriptionId: Types.ObjectId;
  /** Sent in `X-Menukaze-Webhook-Id`. */
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastResponseStatus?: number;
  lastResponseBody?: string;
  lastError?: string;
  deliveredAt?: Date;
  failedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookDeliverySchema = new Schema<WebhookDeliveryDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'WebhookSubscription', required: true },
    eventId: { type: String, required: true, maxlength: 64 },
    eventType: { type: String, required: true, maxlength: 80 },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed'],
      required: true,
      default: 'pending',
    },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, required: true },
    lastResponseStatus: { type: Number, min: 0 },
    lastResponseBody: { type: String, maxlength: 4000 },
    lastError: { type: String, maxlength: 500 },
    deliveredAt: Date,
    failedAt: Date,
  },
  { timestamps: true, collection: 'webhook_deliveries' },
);

webhookDeliverySchema.plugin(tenantScopedPlugin);
webhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
webhookDeliverySchema.index({ restaurantId: 1, createdAt: -1 });
webhookDeliverySchema.index({ restaurantId: 1, subscriptionId: 1, createdAt: -1 });

export const WEBHOOK_RETRY_DELAYS_MS: number[] = [
  60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length;

export type WebhookDeliveryHydratedDoc = HydratedDocument<WebhookDeliveryDoc>;
export type WebhookDeliveryModel = Model<WebhookDeliveryDoc>;

export function webhookDeliveryModel(connection: Connection): WebhookDeliveryModel {
  return (
    (connection.models['WebhookDelivery'] as WebhookDeliveryModel | undefined) ??
    connection.model<WebhookDeliveryDoc>('WebhookDelivery', webhookDeliverySchema)
  );
}
