/**
 * Migration: backfill zone = 'Main floor' for all tables with no zone set.
 *
 * Usage (from repo root):
 *   pnpm --filter @menukaze/db exec tsx scripts/migrate-tables-main-floor.ts
 */

import {
  closeAllConnections,
  createConnectionFromUri,
  getModels,
  readSeedMongoEnv,
} from '@menukaze/db';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';

async function main(): Promise<void> {
  const env = readSeedMongoEnv(DEFAULT_URI);
  const conn = await createConnectionFromUri(env.MONGODB_URI, env.MONGODB_DB_LIVE);
  const { Table } = getModels(conn);

  const result = await Table.updateMany(
    { $or: [{ zone: { $exists: false } }, { zone: null }, { zone: '' }] },
    { $set: { zone: 'Main floor' } },
    { skipTenantGuard: true },
  ).exec();

  process.stdout.write(
    `Done: ${String(result.modifiedCount)} tables updated → zone: 'Main floor'\n`,
  );

  await conn.close();
  await closeAllConnections();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
