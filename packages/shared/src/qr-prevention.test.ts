import { describe, expect, it } from 'vitest';
import {
  deviceFingerprint,
  haversineMeters,
  ipFromHeaders,
  isInsideGeofence,
  preCheckQrLocation,
} from './qr-prevention';

describe('haversineMeters', () => {
  it('returns 0 for identical coords', () => {
    const d = haversineMeters({ lat: 12.97, lng: 77.59 }, { lat: 12.97, lng: 77.59 });
    expect(d).toBe(0);
  });

  it('returns ~111 km between two degrees of latitude', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('isInsideGeofence', () => {
  const restaurant = { coordinates: [77.5946, 12.9716] as [number, number], geofenceRadiusM: 100 };

  it('passes inside the radius', () => {
    const result = isInsideGeofence(restaurant, { lat: 12.9716, lng: 77.5946 });
    expect(result.ok).toBe(true);
  });

  it('fails outside the radius', () => {
    const result = isInsideGeofence(restaurant, { lat: 12.97, lng: 77.6 });
    expect(result.ok).toBe(false);
    expect(result.distanceM).toBeGreaterThan(100);
  });

  it('treats 0,0 as unconfigured and passes', () => {
    const r = { coordinates: [0, 0] as [number, number], geofenceRadiusM: 50 };
    expect(isInsideGeofence(r, { lat: 12.97, lng: 77.59 })).toEqual({ ok: true, distanceM: 0 });
  });
});

describe('preCheckQrLocation', () => {
  const restaurant = {
    coordinates: [77.5946, 12.9716] as [number, number],
    geofenceRadiusM: 100,
    wifiPublicIps: ['1.2.3.4'],
  };

  it('passes when coords inside geofence', () => {
    const result = preCheckQrLocation({
      restaurant,
      coords: { lat: 12.9716, lng: 77.5946 },
    });
    expect(result.ok).toBe(true);
  });

  it('blocks when coords are outside the geofence', () => {
    const result = preCheckQrLocation({
      restaurant,
      coords: { lat: 12.97, lng: 77.65 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('outside_geofence');
  });

  it('passes without coords when not in strict mode', () => {
    expect(preCheckQrLocation({ restaurant }).ok).toBe(true);
  });

  it('blocks without coords in strict mode', () => {
    const result = preCheckQrLocation({
      restaurant: { ...restaurant, hardening: { strictMode: true } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('no_location');
  });

  it('blocks when wifi gate is on and IP is not in allowlist', () => {
    const result = preCheckQrLocation({
      restaurant: { ...restaurant, hardening: { wifiGate: true } },
      ip: '9.9.9.9',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('wifi_required');
  });

  it('passes via wifi gate without coords', () => {
    const result = preCheckQrLocation({
      restaurant: { ...restaurant, hardening: { wifiGate: true } },
      ip: '1.2.3.4',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.passedBy).toBe('wifi');
  });
});

describe('deviceFingerprint', () => {
  it('produces stable hashes for identical input', () => {
    const a = deviceFingerprint({ ip: '1.1.1.1', userAgent: 'UA', acceptLanguage: 'en' });
    const b = deviceFingerprint({ ip: '1.1.1.1', userAgent: 'UA', acceptLanguage: 'en' });
    expect(a).toBe(b);
  });

  it('produces different hashes for different IPs', () => {
    const a = deviceFingerprint({ ip: '1.1.1.1', userAgent: 'UA' });
    const b = deviceFingerprint({ ip: '2.2.2.2', userAgent: 'UA' });
    expect(a).not.toBe(b);
  });
});

describe('ipFromHeaders', () => {
  const make = (entries: Record<string, string>) => ({
    get(name: string): string | null {
      return entries[name.toLowerCase()] ?? null;
    },
  });

  it('reads x-forwarded-for first entry', () => {
    expect(ipFromHeaders(make({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(ipFromHeaders(make({ 'x-real-ip': '4.3.2.1' }))).toBe('4.3.2.1');
  });

  it('returns null when no header present', () => {
    expect(ipFromHeaders(make({}))).toBeNull();
  });
});
