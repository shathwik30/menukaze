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
import { Resend } from 'resend';

interface CreateAuthOptions {
  dbName?: DbName;
  baseURL?: string;
  /** Override the secret. Falls back to BETTER_AUTH_SECRET env. */
  secret?: string;
  /** Framework-specific plugins (Next.js apps pass `nextCookies()` here). */
  plugins?: BetterAuthOptions['plugins'];
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export async function createAuth(opts: CreateAuthOptions = {}) {
  const dbName = opts.dbName ?? 'live';
  const connection = await getMongoConnection(dbName);

  const db = connection.db!;

  const config: BetterAuthOptions = {
    secret: opts.secret ?? readEnv('BETTER_AUTH_SECRET'),
    baseURL: opts.baseURL ?? process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000',
    database: mongodbAdapter(db),
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Auto-verify email for users who have a pending staff invite.
            // The invite email itself proves ownership — no need for a
            // separate verification step. This is standard SaaS practice
            // (Slack, Linear, Notion all do this).
            const invite = await db.collection('staff_invites').findOne({
              email: {
                $regex: new RegExp(`^${user.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
              },
              usedAt: { $exists: false },
              revokedAt: { $exists: false },
              expiresAt: { $gt: new Date() },
            });
            if (invite) {
              await db
                .collection('user')
                .updateOne({ email: user.email }, { $set: { emailVerified: true } });
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Defaults to ON for safety. Dev sets MENUKAZE_REQUIRE_EMAIL_VERIFICATION=false
      // in .env.local until Phase 4 step 12 wires Resend for verification email.
      requireEmailVerification: process.env['MENUKAZE_REQUIRE_EMAIL_VERIFICATION'] !== 'false',
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        const apiKey = process.env['RESEND_API_KEY'];
        if (!apiKey) {
          console.warn(`[auth] No RESEND_API_KEY — skipping verification email to ${user.email}`);
          return;
        }
        const from = process.env['RESEND_FROM_ADDRESS'] ?? 'Menukaze <noreply@menukaze.com>';
        const resend = new Resend(apiKey);
        await resend.emails.send({
          from,
          to: user.email,
          subject: 'Verify your Menukaze email',
          html: `<p>Hi ${user.name ?? ''},</p><p>Click the link below to verify your email address:</p><p><a href="${url}">${url}</a></p><p>This link expires in 1 hour.</p>`,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh token if older than 1 day
    },
    advanced: {
      cookiePrefix: 'menukaze',
      // Tie Secure-cookie behavior to the actual scheme of BETTER_AUTH_URL.
      // `next start` forces NODE_ENV=production even in dev, so basing this
      // on NODE_ENV would emit Secure cookies over plain HTTP and break dev.
      useSecureCookies: (opts.baseURL ?? process.env['BETTER_AUTH_URL'] ?? '').startsWith(
        'https://',
      ),
    },
    plugins: opts.plugins,
  };

  return betterAuth(config);
}

export type AuthInstance = Awaited<ReturnType<typeof createAuth>>;
