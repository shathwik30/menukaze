import 'server-only';
import { createAuth, type AuthInstance } from '@menukaze/auth';
import { nextCookies } from 'better-auth/next-js';

/**
 * Memoised BetterAuth instance for the super-admin process. Same pattern as
 * the dashboard — lazy singleton that opens the Mongo connection on first use.
 */
let cached: Promise<AuthInstance> | null = null;

export function getAuth(): Promise<AuthInstance> {
  cached ??= createAuth({
    baseURL: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3004',
    plugins: [nextCookies()],
  });
  return cached;
}
