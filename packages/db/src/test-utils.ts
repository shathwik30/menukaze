import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import { createConnectionFromUri } from './client';

export interface InMemoryMongo {
  connection: Connection;
  close: () => Promise<void>;
}

export async function startInMemoryMongo(dbName = 'menukaze_test'): Promise<InMemoryMongo> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  const connection = await createConnectionFromUri(uri, dbName);

  return {
    connection,
    close: async () => {
      await connection.close();
      await replSet.stop();
    },
  };
}
