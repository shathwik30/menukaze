import 'server-only';
import { createAuth, type AuthInstance } from '@menukaze/auth';
import { nextCookies } from 'better-auth/next-js';

/**
 * Memoised BetterAuth instance for the dashboard process. The first call awaits
 * the Mongoose connection (live database) and constructs the auth singleton;
 * every subsequent call returns the cached promise.
 *
 * Server components use `getAuth()` to read sessions; the API route handler
 * at `app/api/auth/[...all]/route.ts` consumes the same singleton.
 */
let cached: Promise<AuthInstance> | null = null;

export function getAuth(): Promise<AuthInstance> {
  cached ??= createAuth({
    plugins: [nextCookies()],
  });
  return cached;
}
