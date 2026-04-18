import mongoose, { type Connection } from 'mongoose';
import { readMongoEnv } from './env';

export type DbName = 'live' | 'sandbox';

interface ConnectionConfig {
  uri: string;
  dbName: string;
}

const cache = new Map<DbName, Connection>();

export function getMongoConfig(db: DbName): ConnectionConfig {
  const env = readMongoEnv();
  return {
    uri: env.MONGODB_URI,
    dbName: db === 'live' ? env.MONGODB_DB_LIVE : env.MONGODB_DB_SANDBOX,
  };
}

export async function getMongoConnection(db: DbName): Promise<Connection> {
  const cached = cache.get(db);
  if (cached?.readyState === 1) return cached;

  const { uri, dbName } = getMongoConfig(db);
  const connection = await mongoose.createConnection(uri, { dbName }).asPromise();
  cache.set(db, connection);
  return connection;
}

export async function closeAllConnections(): Promise<void> {
  await Promise.all(Array.from(cache.values()).map((c) => c.close()));
  cache.clear();
}

export async function createConnectionFromUri(uri: string, dbName: string): Promise<Connection> {
  return mongoose.createConnection(uri, { dbName }).asPromise();
}
