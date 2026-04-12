import { describe, expect, it } from 'vitest';
import {
  channelSchema,
  createRestaurantInputSchema,
  emailSchema,
  geoPointSchema,
  objectIdSchema,
  phoneE164Schema,
  restaurantSchema,
  slugSchema,
  staffMembershipSchema,
  userSchema,
} from './schemas';

describe('primitive schemas', () => {
  it('objectIdSchema accepts valid hex', () => {
    expect(objectIdSchema.parse('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
  });

  it('objectIdSchema rejects invalid hex', () => {
    expect(() => objectIdSchema.parse('not-an-id')).toThrow();
    expect(() => objectIdSchema.parse('507f1f77bcf86cd79943901')).toThrow();
  });

  it('slugSchema accepts kebab and rejects underscores/uppercase', () => {
    expect(slugSchema.parse('joes-pizza')).toBe('joes-pizza');
    expect(() => slugSchema.parse('Joes_Pizza')).toThrow();
    expect(() => slugSchema.parse('-leading-hyphen')).toThrow();
    expect(() => slugSchema.parse('a')).toThrow();
  });

  it('emailSchema accepts valid emails', () => {
    expect(emailSchema.parse('owner@joes.pizza')).toBe('owner@joes.pizza');
  });

  it('phoneE164Schema accepts E.164 format', () => {
    expect(phoneE164Schema.parse('+14155552671')).toBe('+14155552671');
    expect(phoneE164Schema.parse('+919876543210')).toBe('+919876543210');
    expect(() => phoneE164Schema.parse('14155552671')).toThrow();
    expect(() => phoneE164Schema.parse('+0123')).toThrow();
  });

  it('geoPointSchema accepts GeoJSON longitude-latitude order', () => {
    expect(geoPointSchema.parse({ coordinates: [-122.4194, 37.7749] })).toEqual({
      type: 'Point',
      coordinates: [-122.4194, 37.7749],
    });
    expect(() =>
      geoPointSchema.parse({ type: 'Point', coordinates: [37.7749, -122.4194] }),
    ).toThrow();
  });
});

describe('userSchema', () => {
  it('accepts BetterAuth-compatible optional fields', () => {
    const parsed = userSchema.parse({
      _id: '507f1f77bcf86cd799439011',
      email: 'Owner@Joes.Pizza',
      emailLower: 'OWNER@JOES.PIZZA',
      emailVerified: false,
      name: 'Joe',
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(parsed.emailLower).toBe('owner@joes.pizza');
    expect(parsed.locale).toBe('en-US');
    expect(parsed.type).toBe('staff');
  });
});

describe('createRestaurantInputSchema', () => {
  it('accepts a minimal valid restaurant', () => {
    const input = {
      slug: 'joes-pizza',
      name: "Joe's Pizza",
      country: 'US',
      currency: 'USD',
      locale: 'en-US',
      timezone: 'America/Los_Angeles',
      addressStructured: {
        line1: '123 Main St',
        city: 'San Francisco',
        country: 'US',
      },
      geo: { type: 'Point', coordinates: [-122.4194, 37.7749] },
    };
    const parsed = createRestaurantInputSchema.parse(input);
    expect(parsed.slug).toBe('joes-pizza');
    expect(parsed.currency).toBe('USD');
  });

  it('rejects unsupported currency', () => {
    expect(() =>
      createRestaurantInputSchema.parse({
        slug: 'joes',
        name: 'Joe',
        country: 'US',
        currency: 'BTC',
        locale: 'en-US',
        timezone: 'UTC',
        addressStructured: { line1: '1 St', city: 'X', country: 'US' },
        geo: { type: 'Point', coordinates: [0, 0] },
      }),
    ).toThrow();
  });

  it('rejects out-of-range geo', () => {
    expect(() =>
      createRestaurantInputSchema.parse({
        slug: 'joes',
        name: 'Joe',
        country: 'US',
        currency: 'USD',
        locale: 'en-US',
        timezone: 'UTC',
        addressStructured: { line1: '1 St', city: 'X', country: 'US' },
        geo: { type: 'Point', coordinates: [0, 91] },
      }),
    ).toThrow();
  });
});

describe('staffMembershipSchema', () => {
  it('accepts a Manager membership with empty customPermissions', () => {
    const membership = {
      _id: '507f1f77bcf86cd799439011',
      restaurantId: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439013',
      role: 'manager',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(staffMembershipSchema.parse(membership).role).toBe('manager');
  });

  it('rejects an invalid role', () => {
    expect(() =>
      staffMembershipSchema.parse({
        _id: '507f1f77bcf86cd799439011',
        restaurantId: '507f1f77bcf86cd799439012',
        userId: '507f1f77bcf86cd799439013',
        role: 'admin',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).toThrow();
  });
});

describe('restaurantSchema defaults', () => {
  it('applies default geofence radius and hardening', () => {
    const minimal = {
      _id: '507f1f77bcf86cd799439011',
      slug: 'joes-pizza',
      name: "Joe's",
      country: 'US',
      currency: 'USD',
      locale: 'en-US',
      timezone: 'America/Los_Angeles',
      addressStructured: { line1: '1', city: 'SF', country: 'US' },
      geo: { type: 'Point', coordinates: [-122.4, 37.7] },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const parsed = restaurantSchema.parse(minimal);
    expect(parsed.dineInSessionTimeoutMinutes).toBe(180);
    expect(parsed.geofenceRadiusM).toBe(100);
    expect(parsed.hardening.maxSessionsPerTable).toBe(1);
    expect(parsed.holidayMode.enabled).toBe(false);
    expect(parsed.throttling.maxConcurrentOrders).toBe(20);
    expect(parsed.onboardingStep).toBe('menu');
    expect(parsed.checklistDismissed).toBe(false);
    expect(parsed.subscriptionStatus).toBe('trial');
  });
});

describe('channelSchema', () => {
  it('accepts a built-in storefront channel', () => {
    const channel = {
      _id: '507f1f77bcf86cd799439011',
      restaurantId: '507f1f77bcf86cd799439012',
      type: 'storefront',
      name: 'Menukaze Storefront',
      color: '#10b981',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const parsed = channelSchema.parse(channel);
    expect(parsed.type).toBe('storefront');
    expect(parsed.color).toBe('#10b981');
  });
});
