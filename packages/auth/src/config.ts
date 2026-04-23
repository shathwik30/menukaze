import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { getMongoConnection, type DbName } from '@menukaze/db';
import { captureMessage } from '@menukaze/monitoring';
import { Resend } from 'resend';

const SESSION_EXPIRES_SECONDS = 60 * 60 * 24 * 30;
const SESSION_REFRESH_AGE_SECONDS = 60 * 60 * 24;

interface StaffInviteLookupDoc {
  email: string;
  usedAt?: Date;
  revokedAt?: Date;
  expiresAt: Date;
}

interface AuthUserWriteDoc {
  id: string;
  emailLower?: string;
  emailVerified?: boolean;
  type?: 'staff' | 'customer';
}

interface CreateAuthOptions {
  dbName?: DbName;
  baseURL?: string;
  trustedOrigins?: BetterAuthOptions['trustedOrigins'];
  secret?: string;
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
    trustedOrigins: opts.trustedOrigins,
    database: mongodbAdapter(db),
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const emailLower = user.email.toLowerCase();
            const escapedEmail = user.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const staffInvites = db.collection<StaffInviteLookupDoc>('staff_invites');
            const users = db.collection<AuthUserWriteDoc>('user');
            // Auto-verify users arriving through a valid staff invite: the
            // invite email already proved ownership, so a second verify step
            // would just add friction (Slack/Linear/Notion do the same).
            const invite = await staffInvites.findOne({
              $or: [
                { email: emailLower },
                { email: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } },
              ],
              usedAt: { $exists: false },
              revokedAt: { $exists: false },
              expiresAt: { $gt: new Date() },
            });
            await users.updateOne(
              { id: user.id },
              {
                $set: {
                  emailLower,
                  type: 'staff',
                  ...(invite ? { emailVerified: true } : {}),
                },
              },
            );
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
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
          captureMessage('No RESEND_API_KEY — skipping verification email', 'warning', {
            surface: 'auth:config',
            userEmail: user.email,
          });
          return;
        }
        const from = process.env['RESEND_FROM_ADDRESS'] ?? 'Menukaze <noreply@menukaze.com>';
        const resend = new Resend(apiKey);
        // Redirect to our own confirmation screen after BetterAuth handles the
        // verify action, so the user sees a branded "email confirmed" page
        // rather than the raw JSON response.
        const separator = url.includes('?') ? '&' : '?';
        const verifyUrl = url.includes('callbackURL=')
          ? url
          : `${url}${separator}callbackURL=${encodeURIComponent('/email-verified')}`;
        await resend.emails.send({
          from,
          to: user.email,
          subject: 'Verify your Menukaze email',
          html: `<p>Hi ${user.name ?? ''},</p><p>Click the link below to verify your email address:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 1 hour.</p>`,
        });
      },
    },
    session: {
      expiresIn: SESSION_EXPIRES_SECONDS,
      updateAge: SESSION_REFRESH_AGE_SECONDS,
    },
    advanced: {
      cookiePrefix: 'menukaze',
      // Derive from the configured URL rather than NODE_ENV: `next start` sets
      // NODE_ENV=production even in dev, which would emit Secure cookies over
      // plain HTTP and break sign-in.
      useSecureCookies: (opts.baseURL ?? process.env['BETTER_AUTH_URL'] ?? '').startsWith(
        'https://',
      ),
    },
    plugins: opts.plugins,
  };

  return betterAuth(config);
}

export type AuthInstance = Awaited<ReturnType<typeof createAuth>>;
