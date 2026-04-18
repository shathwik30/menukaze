import { createHash, randomBytes } from 'node:crypto';
import { Schema, type Types, type Connection, type HydratedDocument, type Model } from 'mongoose';
import { API_KEY_ENVS, API_KEY_SCOPES, type ApiKeyEnv, type ApiKeyScope } from '@menukaze/shared';
import { tenantScopedPlugin } from '../plugins/tenant-scoped';

// The raw key is shown ONCE at creation. Only its SHA-256 hash is persisted
// for request-time lookup. `prefix` + `lastFour` exist solely to help operators
// identify a key in lists.
// Scopes:
//   read_only   — GET endpoints only
//   read_write  — GET + POST (orders, sessions, …)
//   admin       — every endpoint including channels.configure equivalents

export type { ApiKeyScope, ApiKeyEnv };

export interface ApiKeyDoc {
  restaurantId: Types.ObjectId;
  name: string;
  icon?: string;
  color?: string;
  scope: ApiKeyScope;
  env: ApiKeyEnv;
  keyHash: string;
  /** `mk_live_` or `mk_test_`. */
  prefix: string;
  lastFour: string;
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
      enum: API_KEY_SCOPES,
      required: true,
      default: 'read_only',
    },
    env: { type: String, enum: API_KEY_ENVS, required: true, default: 'test' },
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

// Format: `mk_{env}_{24-byte base64url}`. Returns raw once; persist only hash + lastFour.
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
