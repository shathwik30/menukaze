import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_LIVE: z.string().min(1).default('menukaze_live'),
    ENCRYPTION_KEY: z.string().min(32),
    ABLY_API_KEY: z.string().min(1),
    /** Slug of the restaurant this kiosk is locked to. */
    KIOSK_RESTAURANT_SLUG: z.string().optional(),
    /** Optional 4-6 digit PIN that unlocks the admin exit overlay. */
    KIOSK_EXIT_PIN: z
      .string()
      .regex(/^\d{4,6}$/, 'KIOSK_EXIT_PIN must be 4-6 digits')
      .optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    MONGODB_URI: process.env['MONGODB_URI'],
    MONGODB_DB_LIVE: process.env['MONGODB_DB_LIVE'],
    ENCRYPTION_KEY: process.env['ENCRYPTION_KEY'],
    ABLY_API_KEY: process.env['ABLY_API_KEY'],
    KIOSK_RESTAURANT_SLUG: process.env['KIOSK_RESTAURANT_SLUG'],
    KIOSK_EXIT_PIN: process.env['KIOSK_EXIT_PIN'],
    UPSTASH_REDIS_REST_URL: process.env['UPSTASH_REDIS_REST_URL'],
    UPSTASH_REDIS_REST_TOKEN: process.env['UPSTASH_REDIS_REST_TOKEN'],
  },
  skipValidation: process.env['SKIP_ENV_VALIDATION'] === 'true',
  emptyStringAsUndefined: true,
});
