'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side BetterAuth client for the super-admin login form.
 */
export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env['SUPER_ADMIN_BETTER_AUTH_URL'] ?? 'http://localhost:3004'),
});
