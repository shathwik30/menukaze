import { describe, expect, it } from 'vitest';
import { formatPickupNumber } from './order-reference';

describe('formatPickupNumber', () => {
  it('produces a 3-digit number in the [100, 999] range', () => {
    const num = formatPickupNumber('MK-ABC123');
    expect(num).toMatch(/^\d{3}$/);
    const n = Number.parseInt(num, 10);
    expect(n).toBeGreaterThanOrEqual(100);
    expect(n).toBeLessThanOrEqual(999);
  });

  it('is stable for the same public order id', () => {
    expect(formatPickupNumber('MK-ABC123')).toBe(formatPickupNumber('MK-ABC123'));
  });

  it('ignores case and surrounding whitespace', () => {
    expect(formatPickupNumber('  mk-abc123  ')).toBe(formatPickupNumber('MK-ABC123'));
  });

  it('produces distinct numbers for typical distinct ids', () => {
    expect(formatPickupNumber('MK-ABC123')).not.toBe(formatPickupNumber('MK-XYZ789'));
  });
});
