import { describe, expect, it } from 'vitest';
import {
  maxSelectionsForModifierGroup,
  validateModifierSelection,
  type ModifierGroupLike,
} from './modifiers';

const sizeGroup: ModifierGroupLike = {
  name: 'Size',
  required: true,
  max: 1,
  options: [
    { name: 'small', priceMinor: 0 },
    { name: 'large', priceMinor: 200 },
  ],
};

const extrasGroup: ModifierGroupLike = {
  name: 'Extras',
  required: false,
  max: 2,
  options: [
    { name: 'cheese', priceMinor: 100 },
    { name: 'olives', priceMinor: 150 },
    { name: 'basil', priceMinor: 50 },
  ],
};

describe('maxSelectionsForModifierGroup', () => {
  it('returns 0 for a group with no options', () => {
    expect(maxSelectionsForModifierGroup({ ...sizeGroup, options: [] })).toBe(0);
  });

  it('returns the full option count when max is null or below 1', () => {
    expect(maxSelectionsForModifierGroup({ ...extrasGroup, max: null })).toBe(3);
    expect(maxSelectionsForModifierGroup({ ...extrasGroup, max: 0 })).toBe(3);
  });

  it('clamps max to the option count', () => {
    expect(maxSelectionsForModifierGroup({ ...extrasGroup, max: 10 })).toBe(3);
  });
});

describe('validateModifierSelection', () => {
  it('accepts a valid selection and resolves prices from the group', () => {
    const result = validateModifierSelection(
      [sizeGroup, extrasGroup],
      [
        { groupName: 'Size', optionName: 'large' },
        { groupName: 'Extras', optionName: 'cheese' },
      ],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modifiers).toEqual([
        { groupName: 'Size', optionName: 'large', priceMinor: 200 },
        { groupName: 'Extras', optionName: 'cheese', priceMinor: 100 },
      ]);
    }
  });

  it('rejects selections that reference an unknown group', () => {
    const result = validateModifierSelection(
      [sizeGroup],
      [{ groupName: 'Bogus', optionName: 'small' }],
    );
    expect(result.ok).toBe(false);
  });

  it('rejects selections that reference an unknown option', () => {
    const result = validateModifierSelection(
      [sizeGroup],
      [{ groupName: 'Size', optionName: 'huge' }],
    );
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate options within the same group', () => {
    const result = validateModifierSelection(
      [extrasGroup],
      [
        { groupName: 'Extras', optionName: 'cheese' },
        { groupName: 'Extras', optionName: 'cheese' },
      ],
    );
    expect(result.ok).toBe(false);
  });

  it('rejects when a required group has no selection', () => {
    const result = validateModifierSelection([sizeGroup], []);
    expect(result.ok).toBe(false);
  });

  it('allows omitting non-required groups entirely', () => {
    const result = validateModifierSelection([extrasGroup], []);
    expect(result.ok).toBe(true);
  });

  it('rejects when a group exceeds its max selections', () => {
    const result = validateModifierSelection(
      [extrasGroup],
      [
        { groupName: 'Extras', optionName: 'cheese' },
        { groupName: 'Extras', optionName: 'olives' },
        { groupName: 'Extras', optionName: 'basil' },
      ],
    );
    expect(result.ok).toBe(false);
  });
});
