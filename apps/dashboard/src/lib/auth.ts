import 'server-only';
import { createAuth, type AuthInstance } from '@menukaze/auth';
import { nextCookies } from 'better-auth/next-js';

let cached: Promise<AuthInstance> | null = null;

export function getAuth(): Promise<AuthInstance> {
  cached ??= createAuth({
    plugins: [nextCookies()],
  });
  return cached;
}
