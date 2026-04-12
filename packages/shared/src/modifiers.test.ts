import { describe, expect, it } from 'vitest';
import { maxSelectionsForModifierGroup, validateModifierSelection } from './modifiers';

describe('modifiers', () => {
  const groups = [
    {
      name: 'Choose a size',
      required: true,
      max: 1,
      options: [
        { name: 'Small', priceMinor: 0 },
        { name: 'Large', priceMinor: 200 },
      ],
    },
    {
      name: 'Extras',
      required: false,
      max: 0,
      options: [
        { name: 'Cheese', priceMinor: 100 },
        { name: 'Jalapeno', priceMinor: 50 },
      ],
    },
  ];

  it('treats max=0 as unlimited within the option list', () => {
    expect(maxSelectionsForModifierGroup(groups[1]!)).toBe(2);
  });

  it('requires selections for required groups', () => {
    expect(validateModifierSelection(groups, [], 'Burger')).toEqual({
      ok: false,
      error: 'Choose a size is required for Burger.',
    });
  });

  it('rejects too many selections for capped groups', () => {
    expect(
      validateModifierSelection(
        groups,
        [
          { groupName: 'Choose a size', optionName: 'Small' },
          { groupName: 'Choose a size', optionName: 'Large' },
        ],
        'Burger',
      ),
    ).toEqual({
      ok: false,
      error: 'Choose a size allows only one selection.',
    });
  });

  it('resolves canonical modifier prices in group order', () => {
    expect(
      validateModifierSelection(
        groups,
        [
          { groupName: 'Extras', optionName: 'Cheese', priceMinor: 0 },
          { groupName: 'Choose a size', optionName: 'Large', priceMinor: 1 },
        ],
        'Burger',
      ),
    ).toEqual({
      ok: true,
      modifiers: [
        { groupName: 'Choose a size', optionName: 'Large', priceMinor: 200 },
        { groupName: 'Extras', optionName: 'Cheese', priceMinor: 100 },
      ],
    });
  });
});
