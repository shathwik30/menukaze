import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const skipValidation = () => process.env['SKIP_ENV_VALIDATION'] === 'true';

function readProcessEnv(key: string): string | undefined {
  const value = process.env[key];
  return value === '' ? undefined : value;
}

export function readMongoEnv() {
  return createEnv({
    server: {
      MONGODB_URI: z.string().min(1),
      MONGODB_DB_LIVE: z.string().min(1).default('menukaze_live'),
      MONGODB_DB_SANDBOX: z.string().min(1).default('menukaze_sandbox'),
    },
    runtimeEnv: {
      MONGODB_URI: readProcessEnv('MONGODB_URI'),
      MONGODB_DB_LIVE: readProcessEnv('MONGODB_DB_LIVE') ?? 'menukaze_live',
      MONGODB_DB_SANDBOX: readProcessEnv('MONGODB_DB_SANDBOX') ?? 'menukaze_sandbox',
    },
    skipValidation: skipValidation(),
    emptyStringAsUndefined: true,
  });
}

export function readSeedMongoEnv(defaultUri: string) {
  return createEnv({
    server: {
      MONGODB_URI: z.string().min(1).default(defaultUri),
      MONGODB_DB_LIVE: z.string().min(1).default('menukaze_live'),
    },
    runtimeEnv: {
      MONGODB_URI: readProcessEnv('MONGODB_URI') ?? defaultUri,
      MONGODB_DB_LIVE: readProcessEnv('MONGODB_DB_LIVE') ?? 'menukaze_live',
    },
    skipValidation: skipValidation(),
    emptyStringAsUndefined: true,
  });
}

export function readEncryptionEnv() {
  return createEnv({
    server: {
      ENCRYPTION_KEY: z.string().min(1).optional(),
    },
    runtimeEnv: {
      ENCRYPTION_KEY: readProcessEnv('ENCRYPTION_KEY'),
    },
    skipValidation: skipValidation(),
    emptyStringAsUndefined: true,
  });
}
