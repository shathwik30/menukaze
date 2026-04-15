import { afterEach, describe, expect, it } from 'vitest';
import { readMongoEnv, readSeedMongoEnv } from './env';

const ORIGINAL_ENV = {
  MONGODB_URI: process.env['MONGODB_URI'],
  MONGODB_DB_LIVE: process.env['MONGODB_DB_LIVE'],
  MONGODB_DB_SANDBOX: process.env['MONGODB_DB_SANDBOX'],
  SKIP_ENV_VALIDATION: process.env['SKIP_ENV_VALIDATION'],
};

function setEnv(key: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    setEnv(key as keyof typeof ORIGINAL_ENV, value);
  }
});

describe('db env helpers', () => {
  it('keeps Mongo database defaults when validation is skipped', () => {
    setEnv('SKIP_ENV_VALIDATION', 'true');
    setEnv('MONGODB_URI', 'mongodb://127.0.0.1:27017');
    setEnv('MONGODB_DB_LIVE', undefined);
    setEnv('MONGODB_DB_SANDBOX', undefined);

    const env = readMongoEnv();

    expect(env.MONGODB_DB_LIVE).toBe('menukaze_live');
    expect(env.MONGODB_DB_SANDBOX).toBe('menukaze_sandbox');
  });

  it('keeps the seed URI default when validation is skipped', () => {
    setEnv('SKIP_ENV_VALIDATION', 'true');
    setEnv('MONGODB_URI', undefined);
    setEnv('MONGODB_DB_LIVE', undefined);

    const env = readSeedMongoEnv('mongodb://127.0.0.1:27017/?replicaSet=rs0');

    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/?replicaSet=rs0');
    expect(env.MONGODB_DB_LIVE).toBe('menukaze_live');
  });
});
