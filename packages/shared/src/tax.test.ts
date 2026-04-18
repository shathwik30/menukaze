import { describe, expect, it } from 'vitest';
import { computeTax } from './tax';

describe('computeTax', () => {
  it('returns zeros when no rules are configured', () => {
    expect(computeTax(10_000, [])).toEqual({ taxMinor: 0, surchargeMinor: 0 });
  });

  it('computes exclusive tax as a surcharge', () => {
    expect(
      computeTax(10_000, [{ name: 'GST', percent: 18, inclusive: false, scope: 'order' }]),
    ).toEqual({ taxMinor: 1800, surchargeMinor: 1800 });
  });

  it('computes inclusive tax without adding a surcharge', () => {
    expect(
      computeTax(11_800, [{ name: 'GST', percent: 18, inclusive: true, scope: 'order' }]),
    ).toEqual({ taxMinor: 1800, surchargeMinor: 0 });
  });

  it('sums multiple exclusive rules', () => {
    expect(
      computeTax(10_000, [
        { name: 'CGST', percent: 9, inclusive: false, scope: 'order' },
        { name: 'SGST', percent: 9, inclusive: false, scope: 'order' },
      ]),
    ).toEqual({ taxMinor: 1800, surchargeMinor: 1800 });
  });
});
