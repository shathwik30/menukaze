import { createHash, randomBytes } from 'node:crypto';
import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

/**
 * API key — and, by the platform's design, a channel. Every order placed
 * through an API key is automatically tagged with that key's channel name,
 * icon, and colour, so operators can attribute revenue, KDS load, and
 * customer acquisition per integration without an extra step.
 *
 * The raw key string is shown once at creation time. We persist only its
 * SHA-256 hash for lookup at request time. The displayed `lastFour` and
 * `prefix` give operators a way to identify a key in lists.
 *
 * `scope` controls API surface access:
 *   - `read_only`: GET endpoints only
 *   - `read_write`: GET + POST (orders, sessions, etc)
 *   - `admin`: every endpoint including channels.configure equivalents
 */

export type ApiKeyScope = 'read_only' | 'read_write' | 'admin';
export type ApiKeyEnv = 'live' | 'test';

export interface ApiKeyDoc {
  restaurantId: Types.ObjectId;
  name: string;
  /** Display icon key (e.g. "wordpress", "globe"). UI-defined enum. */
  icon?: string;
  /** Tailwind colour token shown on the KDS / orders feed. */
  color?: string;
  scope: ApiKeyScope;
  env: ApiKeyEnv;
  /** SHA-256 of the raw key string. The raw value is never stored. */
  keyHash: string;
  /** Visible prefix shown alongside the key (`mk_live_` or `mk_test_`). */
  prefix: string;
  /** Last four characters of the raw key, shown in the dashboard. */
  lastFour: string;
  /** CORS allowlist for browser-based integrations. */
  allowedOrigins: string[];
  expiresAt?: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  requestCount: number;
  createdByUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<ApiKeyDoc>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true, maxlength: 120 },
    icon: { type: String, maxlength: 32 },
    color: { type: String, maxlength: 32 },
    scope: {
      type: String,
      enum: ['read_only', 'read_write', 'admin'],
      required: true,
      default: 'read_only',
    },
    env: { type: String, enum: ['live', 'test'], required: true, default: 'test' },
    keyHash: { type: String, required: true, unique: true, maxlength: 64 },
    prefix: { type: String, required: true, maxlength: 16 },
    lastFour: { type: String, required: true, maxlength: 8 },
    allowedOrigins: { type: [String], default: [] },
    expiresAt: Date,
    revokedAt: Date,
    lastUsedAt: Date,
    requestCount: { type: Number, default: 0, min: 0 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'api_keys' },
);

apiKeySchema.plugin(tenantScopedPlugin);
apiKeySchema.index({ restaurantId: 1, revokedAt: 1, createdAt: -1 });
apiKeySchema.index({ restaurantId: 1, createdAt: -1 });

/**
 * Generate a new key pair. Returns the raw key (only callers see it once)
 * and the hash + lastFour to persist. Format: `mk_{env}_{32 hex chars}`.
 */
export function generateApiKey(env: ApiKeyEnv): {
  raw: string;
  prefix: string;
  hash: string;
  lastFour: string;
} {
  const random = randomBytes(24).toString('base64url');
  const prefix = `mk_${env}_`;
  const raw = `${prefix}${random}`;
  return {
    raw,
    prefix,
    hash: hashApiKey(raw),
    lastFour: random.slice(-4),
  };
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export type ApiKeyHydratedDoc = HydratedDocument<ApiKeyDoc>;
export type ApiKeyModel = Model<ApiKeyDoc>;

export function apiKeyModel(connection: Connection): ApiKeyModel {
  return (
    (connection.models['ApiKey'] as ApiKeyModel | undefined) ??
    connection.model<ApiKeyDoc>('ApiKey', apiKeySchema)
  );
}
