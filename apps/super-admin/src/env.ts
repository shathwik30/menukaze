import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_LIVE: z.string().min(1).default('menukaze_live'),
    BETTER_AUTH_SECRET: z.string().min(32),
    SUPER_ADMIN_BETTER_AUTH_URL: z.string().url().default('http://localhost:3004'),
  },
  client: {},
  runtimeEnv: {
    MONGODB_URI: process.env['MONGODB_URI'],
    MONGODB_DB_LIVE: process.env['MONGODB_DB_LIVE'],
    BETTER_AUTH_SECRET: process.env['BETTER_AUTH_SECRET'],
    SUPER_ADMIN_BETTER_AUTH_URL: process.env['SUPER_ADMIN_BETTER_AUTH_URL'],
  },
  skipValidation: process.env['SKIP_ENV_VALIDATION'] === 'true',
  emptyStringAsUndefined: true,
});
