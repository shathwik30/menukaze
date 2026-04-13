import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';

/**
 * Platform-level feature flag. Supports global toggles, per-merchant overrides,
 * and plan-tier gating. Not tenant-scoped.
 */

export interface FeatureFlagDoc {
  /** Unique machine-readable key, e.g. 'kiosk_mode'. */
  key: string;
  /** Human-readable display name. */
  label: string;
  description?: string;
  /** Master toggle — when false, feature is off for everyone regardless of overrides. */
  globallyEnabled: boolean;
  /**
   * Per-merchant overrides. Key is restaurantId as string, value is boolean.
   * When globallyEnabled is true: an override of false disables for that merchant.
   * When globallyEnabled is false: an override of true enables for that merchant.
   */
  restaurantOverrides: Map<string, boolean>;
  /** Plan IDs that auto-enable this flag. Empty = available to all plans. */
  planGates: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const featureFlagSchema = new Schema<FeatureFlagDoc>(
  {
    key: { type: String, required: true, unique: true, maxlength: 120 },
    label: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    globallyEnabled: { type: Boolean, default: false },
    restaurantOverrides: { type: Map, of: Boolean, default: () => new Map() },
    planGates: { type: [Schema.Types.ObjectId], ref: 'Plan', default: [] },
  },
  { timestamps: true, collection: 'feature_flags' },
);

export type FeatureFlagHydratedDoc = HydratedDocument<FeatureFlagDoc>;
export type FeatureFlagModel = Model<FeatureFlagDoc>;

export function featureFlagModel(connection: Connection): FeatureFlagModel {
  return (
    (connection.models['FeatureFlag'] as FeatureFlagModel | undefined) ??
    connection.model<FeatureFlagDoc>('FeatureFlag', featureFlagSchema)
  );
}
