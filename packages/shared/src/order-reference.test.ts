import { describe, expect, it } from 'vitest';
import { formatPickupNumber } from './order-reference';

describe('formatPickupNumber', () => {
  it('returns a stable three-digit pickup number', () => {
    const first = formatPickupNumber('MK-7K9F4X');
    const second = formatPickupNumber('mk-7k9f4x');

    expect(first).toMatch(/^\d{3}$/);
    expect(second).toBe(first);
  });
});
