import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .optional()
  .default('false')
  .transform((v) => v === 'true');

export const env = createEnv({
  server: {
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_LIVE: z.string().min(1).default('menukaze_live'),
    ENCRYPTION_KEY: z.string().min(32),
    ABLY_API_KEY: z.string().min(1),
    // Rate-limiters are no-ops when either Upstash var is missing.
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_ADDRESS: z.string().default('Menukaze <noreply@menukaze.com>'),
    MENUKAZE_SKIP_EMAIL: booleanFromString,
  },
  client: {
    NEXT_PUBLIC_STOREFRONT_HOST: z.string().optional(),
  },
  runtimeEnv: {
    MONGODB_URI: process.env['MONGODB_URI'],
    MONGODB_DB_LIVE: process.env['MONGODB_DB_LIVE'],
    ENCRYPTION_KEY: process.env['ENCRYPTION_KEY'],
    ABLY_API_KEY: process.env['ABLY_API_KEY'],
    UPSTASH_REDIS_REST_URL: process.env['UPSTASH_REDIS_REST_URL'],
    UPSTASH_REDIS_REST_TOKEN: process.env['UPSTASH_REDIS_REST_TOKEN'],
    RESEND_API_KEY: process.env['RESEND_API_KEY'],
    RESEND_FROM_ADDRESS: process.env['RESEND_FROM_ADDRESS'],
    MENUKAZE_SKIP_EMAIL: process.env['MENUKAZE_SKIP_EMAIL'],
    NEXT_PUBLIC_STOREFRONT_HOST: process.env['NEXT_PUBLIC_STOREFRONT_HOST'],
  },
  skipValidation: process.env['SKIP_ENV_VALIDATION'] === 'true',
  emptyStringAsUndefined: true,
});
