import { describe, expect, it } from 'vitest';
import { computeTax, computeTaxForLines } from './tax';

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

describe('computeTaxForLines', () => {
  it('applies order rules and item tax classes together', () => {
    expect(
      computeTaxForLines(
        [
          { subtotalMinor: 1_000, taxClassId: 'food' },
          { subtotalMinor: 2_000, taxClassId: 'alcohol' },
        ],
        [{ name: 'Service', percent: 10, inclusive: false, scope: 'order' }],
        [
          {
            id: 'food',
            name: 'Food',
            rules: [{ name: 'GST', percent: 5, inclusive: false, scope: 'item' }],
          },
          {
            id: 'alcohol',
            name: 'Alcohol',
            rules: [{ name: 'VAT', percent: 20, inclusive: false, scope: 'item' }],
          },
        ],
      ),
    ).toEqual({ taxMinor: 750, surchargeMinor: 750 });
  });
});
