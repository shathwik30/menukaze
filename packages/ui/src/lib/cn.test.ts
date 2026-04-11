import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins simple classes', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('drops falsy values', () => {
    expect(cn('px-2', false, undefined, null, 'py-1')).toBe('px-2 py-1');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    expect(cn('px-2', isActive && 'bg-red-500')).toBe('px-2 bg-red-500');
  });

  it('resolves Tailwind conflicts (later wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
  });

  it('keeps non-conflicting modifiers', () => {
    expect(cn('px-2 hover:px-4', 'sm:px-6')).toBe('px-2 hover:px-4 sm:px-6');
  });
});
