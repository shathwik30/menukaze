import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ZERO_HASH, computeAuditHash } from './models/audit-log';
import { getModels } from './models';
import { startInMemoryMongo, type InMemoryMongo } from './test-utils';

let mongo: InMemoryMongo;
const restaurantId = new Types.ObjectId();

beforeAll(async () => {
  mongo = await startInMemoryMongo();
}, 60_000);

afterEach(async () => {
  const { AuditLog } = getModels(mongo.connection);
  await AuditLog.deleteMany({ restaurantId }).exec();
});

afterAll(async () => {
  await mongo.close();
});

describe('AuditLog hash chain', () => {
  it('first entry links to ZERO_HASH and its hash matches computeAuditHash', async () => {
    const { AuditLog } = getModels(mongo.connection);
    const at = new Date('2026-04-01T10:00:00Z');
    const hash = computeAuditHash({
      restaurantId: String(restaurantId),
      action: 'order.status_changed',
      at,
      prevHash: ZERO_HASH,
    });
    const row = await AuditLog.create({
      restaurantId,
      action: 'order.status_changed',
      at,
      prevHash: ZERO_HASH,
      hash,
    });
    expect(row.prevHash).toBe(ZERO_HASH);
    expect(row.hash).toBe(hash);
  });

  it('two entries chain through prevHash', async () => {
    const { AuditLog } = getModels(mongo.connection);
    const at1 = new Date('2026-04-01T10:00:00Z');
    const at2 = new Date('2026-04-01T10:05:00Z');
    const hash1 = computeAuditHash({
      restaurantId: String(restaurantId),
      action: 'step.one',
      at: at1,
      prevHash: ZERO_HASH,
    });
    const hash2 = computeAuditHash({
      restaurantId: String(restaurantId),
      action: 'step.two',
      at: at2,
      prevHash: hash1,
    });
    await AuditLog.create({
      restaurantId,
      action: 'step.one',
      at: at1,
      prevHash: ZERO_HASH,
      hash: hash1,
    });
    await AuditLog.create({
      restaurantId,
      action: 'step.two',
      at: at2,
      prevHash: hash1,
      hash: hash2,
    });

    const rows = await AuditLog.find({ restaurantId }).sort({ at: 1 }).lean().exec();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.prevHash).toBe(ZERO_HASH);
    expect(rows[1]?.prevHash).toBe(rows[0]?.hash);
  });

  it('produces a 64-char hex hash that matches a direct SHA-256', async () => {
    const at = new Date('2026-04-01T10:00:00Z');
    const hash = computeAuditHash({
      restaurantId: String(restaurantId),
      action: 'manual',
      at,
      prevHash: ZERO_HASH,
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const expectedBlob = JSON.stringify({
      r: String(restaurantId),
      u: null,
      a: 'manual',
      rt: null,
      rid: null,
      m: null,
      t: at.toISOString(),
      p: ZERO_HASH,
    });
    expect(hash).toBe(createHash('sha256').update(expectedBlob).digest('hex'));
  });

  it('different tenants produce independent chains for the same action', async () => {
    const at = new Date('2026-04-01T10:00:00Z');
    const altRestaurantId = new Types.ObjectId();
    const hashA = computeAuditHash({
      restaurantId: String(restaurantId),
      action: 'shared.action',
      at,
      prevHash: ZERO_HASH,
    });
    const hashB = computeAuditHash({
      restaurantId: String(altRestaurantId),
      action: 'shared.action',
      at,
      prevHash: ZERO_HASH,
    });
    expect(hashA).not.toBe(hashB);
  });
});
