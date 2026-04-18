import { describe, expect, it } from 'vitest';
import {
  deviceFingerprint,
  haversineMeters,
  ipFromHeaders,
  isInsideGeofence,
  preCheckQrLocation,
} from './qr-prevention';

describe('haversineMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9716, lng: 77.5946 })).toBe(0);
  });

  it('measures sub-metre distance accurately for nearby points', () => {
    const d = haversineMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9717, lng: 77.5946 });
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(12);
  });
});

describe('isInsideGeofence', () => {
  it('treats [0, 0] centre as unconfigured and passes', () => {
    const result = isInsideGeofence(
      { coordinates: [0, 0], geofenceRadiusM: 100 },
      { lat: 12.97, lng: 77.59 },
    );
    expect(result.ok).toBe(true);
  });

  it('passes coords within the configured radius', () => {
    const result = isInsideGeofence(
      { coordinates: [77.5946, 12.9716], geofenceRadiusM: 200 },
      { lat: 12.9717, lng: 77.5946 },
    );
    expect(result.ok).toBe(true);
    expect(result.distanceM).toBeLessThan(200);
  });

  it('rejects coords outside the configured radius', () => {
    const result = isInsideGeofence(
      { coordinates: [77.5946, 12.9716], geofenceRadiusM: 50 },
      { lat: 12.98, lng: 77.6 },
    );
    expect(result.ok).toBe(false);
    expect(result.distanceM).toBeGreaterThan(50);
  });
});

describe('deviceFingerprint', () => {
  it('produces a stable 16-char hex string for identical inputs', () => {
    const a = deviceFingerprint({ ip: '1.2.3.4', userAgent: 'UA', acceptLanguage: 'en' });
    const b = deviceFingerprint({ ip: '1.2.3.4', userAgent: 'UA', acceptLanguage: 'en' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when any signal changes', () => {
    const base = deviceFingerprint({ ip: '1.2.3.4', userAgent: 'UA', acceptLanguage: 'en' });
    expect(deviceFingerprint({ ip: '5.6.7.8', userAgent: 'UA', acceptLanguage: 'en' })).not.toBe(
      base,
    );
    expect(deviceFingerprint({ ip: '1.2.3.4', userAgent: 'V2', acceptLanguage: 'en' })).not.toBe(
      base,
    );
  });
});

describe('ipFromHeaders', () => {
  function headers(entries: Record<string, string>) {
    return {
      get: (name: string): string | null => entries[name.toLowerCase()] ?? null,
    };
  }

  it('prefers the first entry in x-forwarded-for', () => {
    expect(ipFromHeaders(headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1');
  });

  it('falls back to x-real-ip then cf-connecting-ip', () => {
    expect(ipFromHeaders(headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(ipFromHeaders(headers({ 'cf-connecting-ip': '4.4.4.4' }))).toBe('4.4.4.4');
  });

  it('returns null when no known header is present', () => {
    expect(ipFromHeaders(headers({}))).toBeNull();
  });
});

describe('preCheckQrLocation', () => {
  const restaurant = {
    coordinates: [77.5946, 12.9716] as [number, number],
    geofenceRadiusM: 100,
    wifiPublicIps: ['1.1.1.1'],
  };

  it('passes on geofence match', () => {
    const result = preCheckQrLocation({
      restaurant,
      coords: { lat: 12.9716, lng: 77.5946 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.passedBy).toBe('geofence');
  });

  it('rejects on geofence miss with outside_geofence code', () => {
    const result = preCheckQrLocation({
      restaurant,
      coords: { lat: 13.5, lng: 77.5 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('outside_geofence');
  });

  it('rejects missing coords under strictMode', () => {
    const result = preCheckQrLocation({
      restaurant: { ...restaurant, hardening: { strictMode: true } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('no_location');
  });

  it('passes via wifi gate when wifiGate is on and IP is allowlisted', () => {
    const result = preCheckQrLocation({
      restaurant: { ...restaurant, hardening: { wifiGate: true } },
      ip: '1.1.1.1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.passedBy).toBe('wifi');
  });

  it('rejects with wifi_required when wifiGate is on and IP does not match', () => {
    const result = preCheckQrLocation({
      restaurant: { ...restaurant, hardening: { wifiGate: true } },
      ip: '9.9.9.9',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('wifi_required');
  });
});
