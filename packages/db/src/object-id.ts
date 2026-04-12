import { Types } from 'mongoose';

export function isObjectIdString(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

export function parseObjectId(value: string): Types.ObjectId | null {
  return isObjectIdString(value) ? new Types.ObjectId(value) : null;
}

export function parseObjectIds(values: readonly string[]): Types.ObjectId[] | null {
  const objectIds: Types.ObjectId[] = [];

  for (const value of values) {
    const objectId = parseObjectId(value);
    if (!objectId) return null;
    objectIds.push(objectId);
  }

  return objectIds;
}
