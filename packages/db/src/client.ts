/**
 * Mongoose connection wrapper. Each call to `getMongoConnection(dbName)` returns
 * a memoized Mongoose Connection scoped to either the live or sandbox database
 * inside the same Atlas cluster, selected at runtime by the API-key prefix.
 */

import mongoose, { type Connection } from 'mongoose';

export type DbName = 'live' | 'sandbox';

interface ConnectionConfig {
  uri: string;
  dbName: string;
}

const cache = new Map<DbName, Connection>();

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function getMongoConfig(db: DbName): ConnectionConfig {
  return {
    uri: readEnv('MONGODB_URI'),
    dbName: readEnv(db === 'live' ? 'MONGODB_DB_LIVE' : 'MONGODB_DB_SANDBOX'),
  };
}

/**
 * Returns a pooled Mongoose Connection for the requested database.
 * Memoized per-process so the same `db` argument always returns the same
 * Connection (and thus the same registered models).
 */
export async function getMongoConnection(db: DbName): Promise<Connection> {
  const cached = cache.get(db);
  if (cached && cached.readyState === 1) return cached;

  const { uri, dbName } = getMongoConfig(db);
  const connection = await mongoose.createConnection(uri, { dbName }).asPromise();
  cache.set(db, connection);
  return connection;
}

/** Close every cached connection. Used by tests + graceful shutdown. */
export async function closeAllConnections(): Promise<void> {
  await Promise.all(Array.from(cache.values()).map((c) => c.close()));
  cache.clear();
}

/**
 * Construct a Connection from an explicit URI + dbName, bypassing env lookup.
 * Used by `mongodb-memory-server` in tests.
 */
export async function createConnectionFromUri(uri: string, dbName: string): Promise<Connection> {
  return mongoose.createConnection(uri, { dbName }).asPromise();
}
