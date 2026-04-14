import 'server-only';
import { createAuth, type AuthInstance } from '@menukaze/auth';
import { nextCookies } from 'better-auth/next-js';

/**
 * Memoised BetterAuth instance for the super-admin process. Same pattern as
 * the dashboard — lazy singleton that opens the Mongo connection on first use.
 */
let cached: Promise<AuthInstance> | null = null;

const LOCAL_SUPER_ADMIN_ORIGINS = [
  'http://localhost:3004',
  'http://127.0.0.1:3004',
  'http://admin.localhost.menukaze.dev:3004',
];

function getSuperAdminAuthUrl(): string {
  return process.env['SUPER_ADMIN_BETTER_AUTH_URL'] ?? 'http://localhost:3004';
}

export function getAuth(): Promise<AuthInstance> {
  const baseURL = getSuperAdminAuthUrl();

  cached ??= createAuth({
    baseURL,
    trustedOrigins: Array.from(new Set([baseURL, ...LOCAL_SUPER_ADMIN_ORIGINS])),
    plugins: [nextCookies()],
  });
  return cached;
}
