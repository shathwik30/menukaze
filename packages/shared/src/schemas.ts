/**
 * Shared zod schemas — the cross-package contract layer.
 *
 * Schemas live here so they can be imported by:
 *   - tRPC routers (internal API input/output)
 *   - Hono routers (public /v1 API input/output via @hono/zod-validator)
 *   - Mongoose models (pre-validate hooks)
 *   - React Hook Form (zodResolver) on the client
 *
 * IMPORTANT: every schema must remain runtime-safe in the browser. No Node-only
 * imports here. The package's only runtime dep is `zod`.
 */

import { z } from 'zod';
import { CURRENCIES } from './currency';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** A MongoDB ObjectId as a 24-char hex string. We avoid pulling bson into shared. */
export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'must be a 24-char hex ObjectId');

export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'must be lowercase alphanumeric with hyphens');

export const emailSchema = z.string().email().max(320);

export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'must be E.164 format (e.g. +14155552671)');

export const currencySchema = z.enum(Object.keys(CURRENCIES) as [string, ...string[]]);

export const isoCountrySchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'must be a 2-letter ISO country code');

export const isoLocaleSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, 'must be an IETF locale tag');

export const ianaTimezoneSchema = z.string().min(3).max(64);

export const minorAmountSchema = z.number().int().nonnegative();

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex color');

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  _id: objectIdSchema,
  email: emailSchema,
  emailLower: z.string().toLowerCase(),
  emailVerified: z.boolean(),
  name: z.string().min(1).max(120),
  locale: isoLocaleSchema.default('en-US'),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof userSchema>;

// ---------------------------------------------------------------------------
// Staff membership (user × restaurant role pairing)
// ---------------------------------------------------------------------------

export const staffRoleSchema = z.enum([
  'owner',
  'manager',
  'waiter',
  'kitchen',
  'cashier',
  'custom',
]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const staffMembershipSchema = z.object({
  _id: objectIdSchema,
  restaurantId: objectIdSchema,
  userId: objectIdSchema,
  role: staffRoleSchema,
  customPermissions: z.array(z.string()).optional(),
  assignedTableIds: z.array(objectIdSchema).optional(),
  status: z.enum(['active', 'deactivated']).default('active'),
  invitedBy: objectIdSchema.optional(),
  lastLoginAt: z.date().optional(),
  lastLoginIp: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type StaffMembership = z.infer<typeof staffMembershipSchema>;

// ---------------------------------------------------------------------------
// Restaurant — the tenant root
// ---------------------------------------------------------------------------

export const operatingHoursDaySchema = z.object({
  day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  closed: z.boolean().default(false),
  open: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  close: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  breaks: z
    .array(
      z.object({
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .default([]),
});

export const taxRuleSchema = z.object({
  name: z.string().min(1).max(64),
  percent: z.number().min(0).max(100),
  inclusive: z.boolean().default(false),
  scope: z.enum(['order', 'item']).default('order'),
  label: z.string().max(64).optional(),
});

export const restaurantHardeningSchema = z.object({
  strictMode: z.boolean().default(false),
  wifiGate: z.boolean().default(false),
  firstOrderDelayS: z.number().int().nonnegative().default(0),
  maxSessionsPerTable: z.number().int().positive().default(1),
  geofenceRadiusM: z.number().int().positive().default(100),
});

export const restaurantSchema = z.object({
  _id: objectIdSchema,
  slug: slugSchema,
  name: z.string().min(1).max(120),
  customDomain: z.string().max(253).optional(),
  sslStatus: z.enum(['pending', 'active', 'failed']).optional(),
  country: isoCountrySchema,
  currency: currencySchema,
  locale: isoLocaleSchema,
  timezone: ianaTimezoneSchema,
  addressStructured: z
    .object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: isoCountrySchema,
    })
    .partial({ line2: true, state: true, postalCode: true }),
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  wifiPublicIps: z.array(z.string()).default([]),
  logoUrl: z.string().url().optional(),
  phone: phoneE164Schema.optional(),
  hours: z.array(operatingHoursDaySchema).max(7).default([]),
  planId: objectIdSchema.optional(),
  subscriptionStatus: z
    .enum(['trial', 'active', 'past_due', 'suspended', 'cancelled'])
    .default('trial'),
  dineInSessionTimeoutMinutes: z.number().int().min(30).max(720).default(180),
  geofenceRadiusM: z.number().int().positive().default(100),
  hardening: restaurantHardeningSchema.prefault({}),
  taxRules: z.array(taxRuleSchema).default([]),
  featureFlags: z.record(z.string(), z.boolean()).default({}),
  receiptBranding: z
    .object({
      headerColor: hexColorSchema.optional(),
      footerText: z.string().max(500).optional(),
      socials: z.array(z.string().url()).default([]),
    })
    .prefault({}),
  notificationPrefs: z
    .object({
      email: z.boolean().default(true),
      dashboard: z.boolean().default(true),
      sound: z.boolean().default(true),
    })
    .prefault({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Restaurant = z.infer<typeof restaurantSchema>;

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

export const channelTypeSchema = z.enum(['storefront', 'qr_dinein', 'kiosk', 'walk_in', 'api']);
export type ChannelType = z.infer<typeof channelTypeSchema>;

export const channelSchema = z.object({
  _id: objectIdSchema,
  restaurantId: objectIdSchema,
  type: channelTypeSchema,
  name: z.string().min(1).max(64),
  icon: z.string().max(32).optional(),
  color: hexColorSchema.default('#6366f1'),
  kdsSound: z.string().max(64).optional(),
  kdsColor: hexColorSchema.optional(),
  prepTimeOverrideM: z.number().int().nonnegative().optional(),
  taxOverrides: z.array(taxRuleSchema).optional(),
  enabled: z.boolean().default(true),
  apiKeyId: objectIdSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Channel = z.infer<typeof channelSchema>;

// Public-facing input schemas (used by handlers, not models)
export const createRestaurantInputSchema = restaurantSchema.pick({
  slug: true,
  name: true,
  country: true,
  currency: true,
  locale: true,
  timezone: true,
  addressStructured: true,
  geo: true,
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantInputSchema>;
