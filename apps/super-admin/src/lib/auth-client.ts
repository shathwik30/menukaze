'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side BetterAuth client for the super-admin login form.
 */
export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3004'),
});
