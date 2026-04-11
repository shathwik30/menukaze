'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side BetterAuth client. Used by the signup / login forms to call
 * the auth endpoints without writing fetch boilerplate.
 *
 *   const { data, error } = await authClient.signUp.email({ email, password, name });
 *   const { data, error } = await authClient.signIn.email({ email, password });
 *   const { data: session } = authClient.useSession();
 */
export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000'),
});
