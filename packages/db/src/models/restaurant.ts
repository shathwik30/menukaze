import { Schema, Types, type Model, type Connection, type HydratedDocument } from 'mongoose';

/**
 * Tenant root. There is one `restaurants` document per tenant. Every other
 * tenant-scoped collection has `restaurantId` pointing here.
 *
 * Note: this collection is NOT decorated with `tenantScopedPlugin` because IT
 * IS the tenant root — queries against `restaurants` are inherently
 * cross-tenant from the platform's perspective (super-admin, signup flow).
 */

export interface RestaurantDoc {
  slug: string;
  name: string;
  customDomain?: string;
  sslStatus?: 'pending' | 'active' | 'failed';

  country: string;
  currency: string;
  locale: string;
  timezone: string;

  addressStructured: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
  geo: {
    type: 'Point';
    coordinates: [number, number];
  };
  wifiPublicIps: string[];

  logoUrl?: string;
  phone?: string;
  hours: Array<{
    day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
    closed: boolean;
    open?: string;
    close?: string;
    breaks: Array<{ start: string; end: string }>;
  }>;

  planId?: Types.ObjectId;
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  razorpayKeyIdEnc?: string;
  razorpayKeySecretEnc?: string;

  /**
   * Which onboarding wizard step the restaurant is on. Advances as each step
   * is completed; `'complete'` means onboarding is done and the user can
   * skip the wizard entirely.
   */
  onboardingStep: 'menu' | 'tables' | 'razorpay' | 'go-live' | 'complete';

  geofenceRadiusM: number;
  hardening: {
    strictMode: boolean;
    wifiGate: boolean;
    firstOrderDelayS: number;
    maxSessionsPerTable: number;
    geofenceRadiusM: number;
  };

  taxRules: Array<{
    name: string;
    percent: number;
    inclusive: boolean;
    scope: 'order' | 'item';
    label?: string;
  }>;
  featureFlags: Map<string, boolean>;
  receiptBranding: {
    headerColor?: string;
    footerText?: string;
    socials: string[];
  };
  notificationPrefs: {
    email: boolean;
    dashboard: boolean;
    sound: boolean;
  };

  createdAt: Date;
  updatedAt: Date;
}

const restaurantSchema = new Schema<RestaurantDoc>(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    customDomain: { type: String, sparse: true, unique: true },
    sslStatus: { type: String, enum: ['pending', 'active', 'failed'] },

    country: { type: String, required: true },
    currency: { type: String, required: true },
    locale: { type: String, required: true },
    timezone: { type: String, required: true },

    addressStructured: {
      line1: { type: String, required: true },
      line2: String,
      city: { type: String, required: true },
      state: String,
      postalCode: String,
      country: { type: String, required: true },
    },
    geo: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (v: number[]): boolean =>
            v.length === 2 && v[0]! >= -180 && v[0]! <= 180 && v[1]! >= -90 && v[1]! <= 90,
          message: 'coordinates must be [lng, lat]',
        },
      },
    },
    wifiPublicIps: { type: [String], default: [] },

    logoUrl: String,
    phone: String,
    hours: {
      type: [
        {
          day: {
            type: String,
            enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            required: true,
          },
          closed: { type: Boolean, default: false },
          open: String,
          close: String,
          breaks: { type: [{ start: String, end: String }], default: [] },
        },
      ],
      default: [],
    },

    planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
    subscriptionStatus: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'suspended', 'cancelled'],
      default: 'trial',
    },
    razorpayKeyIdEnc: String,
    razorpayKeySecretEnc: String,
    onboardingStep: {
      type: String,
      enum: ['menu', 'tables', 'razorpay', 'go-live', 'complete'],
      default: 'menu',
    },

    geofenceRadiusM: { type: Number, default: 100 },
    hardening: {
      strictMode: { type: Boolean, default: false },
      wifiGate: { type: Boolean, default: false },
      firstOrderDelayS: { type: Number, default: 0 },
      maxSessionsPerTable: { type: Number, default: 1 },
      geofenceRadiusM: { type: Number, default: 100 },
    },

    taxRules: {
      type: [
        {
          name: { type: String, required: true },
          percent: { type: Number, required: true },
          inclusive: { type: Boolean, default: false },
          scope: { type: String, enum: ['order', 'item'], default: 'order' },
          label: String,
        },
      ],
      default: [],
    },
    featureFlags: { type: Map, of: Boolean, default: () => new Map() },
    receiptBranding: {
      headerColor: String,
      footerText: String,
      socials: { type: [String], default: [] },
    },
    notificationPrefs: {
      email: { type: Boolean, default: true },
      dashboard: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
    },
  },
  { timestamps: true, collection: 'restaurants' },
);

// Indexes (slug + customDomain are declared at field level above)
restaurantSchema.index({ subscriptionStatus: 1 });
restaurantSchema.index({ geo: '2dsphere' });

export type RestaurantHydratedDoc = HydratedDocument<RestaurantDoc>;
export type RestaurantModel = Model<RestaurantDoc>;

export function restaurantModel(connection: Connection): RestaurantModel {
  return (
    (connection.models['Restaurant'] as RestaurantModel | undefined) ??
    connection.model<RestaurantDoc>('Restaurant', restaurantSchema)
  );
}
