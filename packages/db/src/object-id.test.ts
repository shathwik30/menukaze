import { describe, expect, it } from 'vitest';
import { parseObjectId, parseObjectIds, isObjectIdString } from './object-id';

describe('object-id helpers', () => {
  const validId = '507f1f77bcf86cd799439011';

  it('parses a valid object id string', () => {
    const parsed = parseObjectId(validId);

    expect(parsed?.toHexString()).toBe(validId);
    expect(isObjectIdString(validId)).toBe(true);
  });

  it('rejects invalid object id strings', () => {
    expect(parseObjectId('invalid-id')).toBeNull();
    expect(isObjectIdString('invalid-id')).toBe(false);
  });

  it('parses a full list or fails as a whole', () => {
    expect(parseObjectIds([validId, validId])?.map((id) => id.toHexString())).toEqual([
      validId,
      validId,
    ]);
    expect(parseObjectIds([validId, 'invalid-id'])).toBeNull();
  });
});
