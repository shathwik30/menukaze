/**
 * QR misuse prevention helpers.
 *
 * The platform protects shared printed QR codes from off-site abuse by
 * combining four signals:
 *   1. Browser geolocation against a restaurant geofence.
 *   2. Restaurant WiFi public IP allowlist (optional, hardening).
 *   3. Per-device rate limit on session starts.
 *   4. Behavioural anomaly flags (velocity / volume / off-hours).
 *
 * These helpers are pure and side-effect free — callers wire them to the
 * session-start server action.
 */

export interface Coords {
  lat: number;
  lng: number;
}

export interface RestaurantGeofence {
  /** Mongoose `geo` field stores [lng, lat]. */
  coordinates: [number, number];
  geofenceRadiusM: number;
}

/**
 * Spherical distance (Haversine) between two lat/lng points in metres.
 * Accurate to a few centimetres at restaurant-radius scale.
 */
export function haversineMeters(a: Coords, b: Coords): number {
  const R = 6_371_000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface GeofenceResult {
  ok: boolean;
  /** Distance in metres from the restaurant centre. */
  distanceM: number;
}

/**
 * Returns whether the customer's reported coords are inside the restaurant's
 * geofence. Treats a `0,0` restaurant centre as unconfigured and passes the
 * check (avoids false negatives during onboarding).
 */
export function isInsideGeofence(restaurant: RestaurantGeofence, coords: Coords): GeofenceResult {
  const [lng, lat] = restaurant.coordinates;
  if (lng === 0 && lat === 0) return { ok: true, distanceM: 0 };
  const distanceM = haversineMeters({ lat, lng }, coords);
  return { ok: distanceM <= restaurant.geofenceRadiusM, distanceM };
}

/**
 * Stable device fingerprint derived from request signals. We deliberately
 * avoid third-party fingerprinting libraries — the goal is rate-limit binning,
 * not user tracking.
 *
 * The hash combines IP, User-Agent, and Accept-Language. It rotates if any
 * of those change, which is acceptable because a determined attacker rotating
 * UA/IP per request is already in the anomaly-detection regime.
 */
export interface FingerprintInput {
  ip?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  /** Optional client-side hint; not required. */
  clientHint?: string | null;
}

export function deviceFingerprint(input: FingerprintInput): string {
  const ip = (input.ip ?? '').trim();
  const ua = (input.userAgent ?? '').trim();
  const lang = (input.acceptLanguage ?? '').trim();
  const hint = (input.clientHint ?? '').trim();
  const blob = `${ip}|${ua}|${lang}|${hint}`;
  // Light-touch hash. Not cryptographic — collision probability is negligible
  // for the volumes a single restaurant sees. Avoids importing node:crypto in
  // edge-runtime contexts that may consume this helper.
  let hash = 0n;
  for (let i = 0; i < blob.length; i += 1) {
    hash = (hash * 131n + BigInt(blob.charCodeAt(i))) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Pull the originating client IP from the standard proxy headers in order
 * of trust. Returns `null` when no header is present.
 */
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
  /** Browser-provided geolocation, if granted. */
  coords?: Coords | null;
  ip?: string | null;
}

export type QrPreCheckResult =
  | { ok: true; passedBy: 'geofence' | 'wifi' | 'no_geo_configured' }
  | { ok: false; error: string; code: 'outside_geofence' | 'no_location' | 'wifi_required' };

/**
 * Combined location pre-check: geofence first, WiFi gate next when enabled,
 * and a friendly fallthrough when no geo data is available outside strict
 * mode. Used by the QR session-start action.
 */
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
