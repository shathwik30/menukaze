/**
 * BetterAuth configuration.
 *
 * BetterAuth manages identity (email/password, email verification, sessions)
 * for both staff and customer users. The multi-tenant role resolution lives
 * in `@menukaze/rbac`, NOT here — BetterAuth has no awareness of restaurants.
 *
 * Apps construct an auth instance via `createAuth()` so the same code path
 * runs against both the live and sandbox databases (selected by `dbName`).
 */

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { getMongoConnection, type DbName } from '@menukaze/db';

interface CreateAuthOptions {
  dbName?: DbName;
  baseURL?: string;
  /** Override the secret. Falls back to BETTER_AUTH_SECRET env. */
  secret?: string;
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export async function createAuth(opts: CreateAuthOptions = {}) {
  const dbName = opts.dbName ?? 'live';
  const connection = await getMongoConnection(dbName);

  const config: BetterAuthOptions = {
    secret: opts.secret ?? readEnv('BETTER_AUTH_SECRET'),
    baseURL: opts.baseURL ?? process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000',
    database: mongodbAdapter(connection.db!),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh token if older than 1 day
    },
    advanced: {
      cookiePrefix: 'menukaze',
      useSecureCookies: process.env['NODE_ENV'] === 'production',
    },
  };

  return betterAuth(config);
}

export type AuthInstance = Awaited<ReturnType<typeof createAuth>>;
