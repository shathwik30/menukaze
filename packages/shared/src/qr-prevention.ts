export interface Coords {
  lat: number;
  lng: number;
}

export interface RestaurantGeofence {
  /** GeoJSON coordinate order: [lng, lat]. */
  coordinates: [number, number];
  geofenceRadiusM: number;
}

export function haversineMeters(a: Coords, b: Coords): number {
  const earthRadiusMeters = 6_371_000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

export interface GeofenceResult {
  ok: boolean;
  distanceM: number;
}

export function isInsideGeofence(restaurant: RestaurantGeofence, coords: Coords): GeofenceResult {
  const [lng, lat] = restaurant.coordinates;
  // Treat unconfigured 0,0 centre as passing so onboarding doesn't block sessions.
  if (lng === 0 && lat === 0) return { ok: true, distanceM: 0 };
  const distanceM = haversineMeters({ lat, lng }, coords);
  return { ok: distanceM <= restaurant.geofenceRadiusM, distanceM };
}

export interface FingerprintInput {
  ip?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  clientHint?: string | null;
}

// Non-cryptographic hash: goal is rate-limit binning, not user tracking.
// Avoids node:crypto so this helper stays usable in edge runtimes.
export function deviceFingerprint(input: FingerprintInput): string {
  const ip = (input.ip ?? '').trim();
  const ua = (input.userAgent ?? '').trim();
  const lang = (input.acceptLanguage ?? '').trim();
  const hint = (input.clientHint ?? '').trim();
  const blob = `${ip}|${ua}|${lang}|${hint}`;
  let hash = 0n;
  for (let i = 0; i < blob.length; i += 1) {
    hash = (hash * 131n + BigInt(blob.charCodeAt(i))) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

export function ipFromHeaders(headers: { get(name: string): string | null }): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return null;
}

export interface QrPreCheckInput {
  restaurant: RestaurantGeofence & {
    wifiPublicIps?: string[];
    hardening?: {
      strictMode?: boolean;
      wifiGate?: boolean;
    };
  };
  coords?: Coords | null;
  ip?: string | null;
}

export type QrPreCheckResult =
  | { ok: true; passedBy: 'geofence' | 'wifi' | 'no_geo_configured' }
  | { ok: false; error: string; code: 'outside_geofence' | 'no_location' | 'wifi_required' };

export function preCheckQrLocation(input: QrPreCheckInput): QrPreCheckResult {
  const { restaurant, coords, ip } = input;
  const strictMode = restaurant.hardening?.strictMode ?? false;
  const wifiGate = restaurant.hardening?.wifiGate ?? false;
  const wifiAllowed = wifiGate
    ? Boolean(ip && (restaurant.wifiPublicIps ?? []).includes(ip))
    : true;

  if (wifiGate && !wifiAllowed) {
    return {
      ok: false,
      code: 'wifi_required',
      error: 'Connect to the restaurant WiFi to start ordering at this table.',
    };
  }

  if (coords) {
    const result = isInsideGeofence(restaurant, coords);
    if (!result.ok) {
      return {
        ok: false,
        code: 'outside_geofence',
        error: "It looks like you're not at the restaurant — please ask your server for help.",
      };
    }
    return { ok: true, passedBy: 'geofence' };
  }

  if (strictMode) {
    return {
      ok: false,
      code: 'no_location',
      error: 'Please allow location access so we can confirm you are at the restaurant.',
    };
  }

  if (wifiGate && wifiAllowed) {
    return { ok: true, passedBy: 'wifi' };
  }

  return { ok: true, passedBy: 'no_geo_configured' };
}

export const DEFAULT_DEVICE_SESSION_LIMIT_PER_DAY = 5;
export const DEFAULT_DEVICE_WINDOW_HOURS = 24;
