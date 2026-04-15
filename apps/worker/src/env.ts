import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .optional()
  .default('false')
  .transform((v) => v === 'true');

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_LIVE: z.string().min(1).default('menukaze_live'),
    ENCRYPTION_KEY: z.string().min(32),
    ABLY_API_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_ADDRESS: z.string().default('Menukaze <noreply@menukaze.com>'),
    MENUKAZE_SKIP_EMAIL: booleanFromString,
    WORKER_SESSION_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    WORKER_WEBHOOK_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
    /**
     * Port for the worker's HTTP health server. Fly.io's `[checks]`
     * block points its TCP/HTTP health check at this port. `0` disables
     * the listener entirely (useful for tests).
     */
    WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  },
  runtimeEnv: process.env,
  skipValidation: process.env['SKIP_ENV_VALIDATION'] === 'true',
  emptyStringAsUndefined: true,
});
