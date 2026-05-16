import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_LIVE: z.string().min(1).default('menukaze_live'),
    ENCRYPTION_KEY: z.string().min(32),
    ABLY_API_KEY: z.string().min(1),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_KIOSK_ASSET_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_KIOSK_ASSET_URL: process.env['NEXT_PUBLIC_KIOSK_ASSET_URL'],
    MONGODB_URI: process.env['MONGODB_URI'],
    MONGODB_DB_LIVE: process.env['MONGODB_DB_LIVE'],
    ENCRYPTION_KEY: process.env['ENCRYPTION_KEY'],
    ABLY_API_KEY: process.env['ABLY_API_KEY'],
    UPSTASH_REDIS_REST_URL: process.env['UPSTASH_REDIS_REST_URL'],
    UPSTASH_REDIS_REST_TOKEN: process.env['UPSTASH_REDIS_REST_TOKEN'],
  },
  skipValidation: process.env['SKIP_ENV_VALIDATION'] === 'true',
  emptyStringAsUndefined: true,
});
