import { Schema, type Types, type Model, type Connection, type HydratedDocument } from 'mongoose';
import { DEFAULT_PREP_MINUTES, WEEKDAYS, type Weekday } from '@menukaze/shared';

// Tenant root. Not decorated with tenantScopedPlugin — platform signup and
// super-admin flows need cross-tenant restaurant lookups.

export type RestaurantSubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled';

const RESTAURANT_SUBSCRIPTION_STATUSES: RestaurantSubscriptionStatus[] = [
  'trial',
  'active',
  'past_due',
  'suspended',
  'cancelled',
];

export type RestaurantOnboardingStep =
  | 'menu'
  | 'tables'
  | 'razorpay'
  | 'staff'
  | 'go-live'
  | 'complete';

const RESTAURANT_ONBOARDING_STEPS: RestaurantOnboardingStep[] = [
  'menu',
  'tables',
  'razorpay',
  'staff',
  'go-live',
  'complete',
];

export type RestaurantSslStatus = 'pending' | 'active' | 'failed';
const RESTAURANT_SSL_STATUSES: RestaurantSslStatus[] = ['pending', 'active', 'failed'];

export interface RestaurantDoc {
  slug: string;
  name: string;
  customDomain?: string;
  sslStatus?: RestaurantSslStatus;

  country: string;
  currency: string;
  locale: string;
  timezone: string;

  description?: string;
  email?: string;

  estimatedPrepMinutes: number;
  minimumOrderMinor: number;
  deliveryFeeMinor: number;
  dineInSessionTimeoutMinutes: number;

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
    day: Weekday;
    closed: boolean;
    open?: string;
    close?: string;
    breaks: Array<{ start: string; end: string }>;
  }>;

  planId?: Types.ObjectId;
  subscriptionStatus: RestaurantSubscriptionStatus;
  razorpayKeyIdEnc?: string;
  razorpayKeySecretEnc?: string;

  onboardingStep: RestaurantOnboardingStep;
  liveAt?: Date;
  checklistDismissed: boolean;

  geofenceRadiusM: number;
  hardening: {
    strictMode: boolean;
    wifiGate: boolean;
    firstOrderDelayS: number;
    maxSessionsPerTable: number;
    geofenceRadiusM: number;
  };

  /** When enabled, the storefront cart is disabled with the configured message. */
  holidayMode: {
    enabled: boolean;
    message?: string;
  };

  /** When activeOrders ≥ maxConcurrentOrders the storefront blocks new checkouts. */
  throttling: {
    enabled: boolean;
    maxConcurrentOrders: number;
  };

  taxRules: Array<{
    name: string;
    percent: number;
    inclusive: boolean;
    scope: 'order' | 'item';
    label?: string;
  }>;
  reservationSettings: {
    enabled: boolean;
    slotMinutes: number;
    maxPartySize: number;
    bufferMinutes: number;
    autoConfirm: boolean;
    reminderHours: number;
    /** ISO YYYY-MM-DD strings in the restaurant's timezone. */
    blockedDates: string[];
  };
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
    sslStatus: { type: String, enum: RESTAURANT_SSL_STATUSES },

    country: { type: String, required: true },
    currency: { type: String, required: true },
    locale: { type: String, required: true },
    timezone: { type: String, required: true },

    description: { type: String, maxlength: 1000 },
    email: { type: String, maxlength: 320 },

    estimatedPrepMinutes: {
      type: Number,
      required: true,
      default: DEFAULT_PREP_MINUTES,
      min: 1,
      max: 600,
    },
    minimumOrderMinor: { type: Number, required: true, default: 0, min: 0 },
    deliveryFeeMinor: { type: Number, required: true, default: 0, min: 0 },
    dineInSessionTimeoutMinutes: { type: Number, required: true, default: 180, min: 30, max: 720 },

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
            enum: WEEKDAYS,
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
      enum: RESTAURANT_SUBSCRIPTION_STATUSES,
      default: 'trial',
    },
    razorpayKeyIdEnc: String,
    razorpayKeySecretEnc: String,
    onboardingStep: {
      type: String,
      enum: RESTAURANT_ONBOARDING_STEPS,
      default: 'menu',
    },
    liveAt: Date,
    checklistDismissed: { type: Boolean, default: false },

    geofenceRadiusM: { type: Number, default: 100 },
    hardening: {
      strictMode: { type: Boolean, default: false },
      wifiGate: { type: Boolean, default: false },
      firstOrderDelayS: { type: Number, default: 0 },
      maxSessionsPerTable: { type: Number, default: 1 },
      geofenceRadiusM: { type: Number, default: 100 },
    },
    holidayMode: {
      enabled: { type: Boolean, default: false },
      message: String,
    },
    throttling: {
      enabled: { type: Boolean, default: false },
      maxConcurrentOrders: { type: Number, default: 20 },
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
    reservationSettings: {
      enabled: { type: Boolean, default: false },
      slotMinutes: { type: Number, default: 60, min: 15, max: 240 },
      maxPartySize: { type: Number, default: 8, min: 1, max: 200 },
      bufferMinutes: { type: Number, default: 0, min: 0, max: 120 },
      autoConfirm: { type: Boolean, default: true },
      reminderHours: { type: Number, default: 24, min: 0, max: 168 },
      blockedDates: { type: [String], default: [] },
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

restaurantSchema.index({ subscriptionStatus: 1 });
restaurantSchema.index({ createdAt: -1 });
restaurantSchema.index({ subscriptionStatus: 1, createdAt: -1 });
restaurantSchema.index({ onboardingStep: 1, createdAt: -1 });
restaurantSchema.index({ liveAt: 1, createdAt: -1 });
restaurantSchema.index({ geo: '2dsphere' });

export type RestaurantHydratedDoc = HydratedDocument<RestaurantDoc>;
export type RestaurantModel = Model<RestaurantDoc>;

export function restaurantModel(connection: Connection): RestaurantModel {
  return (
    (connection.models['Restaurant'] as RestaurantModel | undefined) ??
    connection.model<RestaurantDoc>('Restaurant', restaurantSchema)
  );
}
