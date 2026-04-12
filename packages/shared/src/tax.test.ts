import { describe, expect, it } from 'vitest';
import { computeTax } from './tax';

describe('computeTax', () => {
  it('returns zeros when no rules', () => {
    expect(computeTax(10000, [])).toEqual({ taxMinor: 0, surchargeMinor: 0 });
  });

  it('returns zeros when subtotal is 0', () => {
    expect(computeTax(0, [{ name: 'GST', percent: 18, inclusive: false, scope: 'order' }])).toEqual(
      { taxMinor: 0, surchargeMinor: 0 },
    );
  });

  it('computes exclusive tax correctly', () => {
    // 18% exclusive on ₹100 (10000 paise) → tax = 1800, total surcharge = 1800
    const result = computeTax(10000, [
      { name: 'GST', percent: 18, inclusive: false, scope: 'order' },
    ]);
    expect(result).toEqual({ taxMinor: 1800, surchargeMinor: 1800 });
  });

  it('computes inclusive tax correctly', () => {
    // 18% inclusive on 11800 paise: tax = 11800 - 11800/1.18 ≈ 1800, surcharge = 0
    const result = computeTax(11800, [
      { name: 'GST', percent: 18, inclusive: true, scope: 'order' },
    ]);
    expect(result.taxMinor).toBe(1800);
    expect(result.surchargeMinor).toBe(0);
  });

  it('sums multiple exclusive rules', () => {
    // 9% CGST + 9% SGST on 10000 paise → 900 + 900 = 1800 tax, 1800 surcharge
    const result = computeTax(10000, [
      { name: 'CGST', percent: 9, inclusive: false, scope: 'order' },
      { name: 'SGST', percent: 9, inclusive: false, scope: 'order' },
    ]);
    expect(result).toEqual({ taxMinor: 1800, surchargeMinor: 1800 });
  });

  it('skips rules with 0 percent', () => {
    const result = computeTax(10000, [
      { name: 'Zero', percent: 0, inclusive: false, scope: 'order' },
    ]);
    expect(result).toEqual({ taxMinor: 0, surchargeMinor: 0 });
  });
});
