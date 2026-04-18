import { describe, expect, it } from 'vitest';
import {
  ALL_FLAGS,
  OWNER_ONLY_FLAGS,
  InvalidCustomRoleError,
  assertCustomRoleFlags,
  isFlag,
  type Flag,
} from './flags';
import { ROLE_FLAGS, hasAllFlags, hasAnyFlag, resolveFlags } from './roles';

describe('ROLE_FLAGS', () => {
  it('grants the owner every flag in ALL_FLAGS', () => {
    for (const flag of ALL_FLAGS) {
      expect(ROLE_FLAGS.owner.has(flag)).toBe(true);
    }
  });

  it('withholds every OWNER_ONLY flag from the manager role', () => {
    for (const flag of OWNER_ONLY_FLAGS) {
      expect(ROLE_FLAGS.manager.has(flag)).toBe(false);
    }
  });

  it('manager otherwise holds all non-owner-only flags', () => {
    for (const flag of ALL_FLAGS) {
      if (OWNER_ONLY_FLAGS.has(flag)) continue;
      expect(ROLE_FLAGS.manager.has(flag)).toBe(true);
    }
  });

  it('waiter / kitchen / cashier cannot manage staff, webhooks, or billing', () => {
    const forbidden: Flag[] = ['staff.manage_custom_roles', 'webhooks.manage', 'billing.manage'];
    for (const role of ['waiter', 'kitchen', 'cashier'] as const) {
      for (const flag of forbidden) {
        expect(ROLE_FLAGS[role].has(flag)).toBe(false);
      }
    }
  });
});

describe('resolveFlags', () => {
  it('returns the static flag set for predefined roles', () => {
    expect(resolveFlags({ role: 'kitchen' })).toBe(ROLE_FLAGS.kitchen);
  });

  it('filters custom permissions down to known Flag strings', () => {
    const resolved = resolveFlags({
      role: 'custom',
      customPermissions: ['kds.view', 'not-a-real-flag', 'orders.view_all'],
    });
    expect(resolved.has('kds.view')).toBe(true);
    expect(resolved.has('orders.view_all')).toBe(true);
    expect(resolved.size).toBe(2);
  });

  it('returns an empty set for a custom role with no permissions', () => {
    expect(resolveFlags({ role: 'custom' }).size).toBe(0);
  });
});

describe('hasAllFlags / hasAnyFlag', () => {
  const membership = { role: 'waiter' as const };

  it('hasAllFlags is true only when every required flag is present', () => {
    expect(hasAllFlags(membership, ['tables.view', 'kds.view'])).toBe(true);
    expect(hasAllFlags(membership, ['tables.view', 'webhooks.manage'])).toBe(false);
  });

  it('hasAnyFlag is true when at least one required flag is present', () => {
    expect(hasAnyFlag(membership, ['webhooks.manage', 'kds.view'])).toBe(true);
    expect(hasAnyFlag(membership, ['webhooks.manage', 'billing.manage'])).toBe(false);
  });

  it('an empty required list is trivially true for hasAllFlags and false for hasAnyFlag', () => {
    expect(hasAllFlags(membership, [])).toBe(true);
    expect(hasAnyFlag(membership, [])).toBe(false);
  });
});

describe('assertCustomRoleFlags', () => {
  it('accepts a set of legal non-owner-only flags', () => {
    expect(() => assertCustomRoleFlags(['kds.view', 'orders.view_all'])).not.toThrow();
  });

  it('rejects owner-only flags', () => {
    expect(() => assertCustomRoleFlags(['kds.view', 'webhooks.manage'])).toThrow(
      InvalidCustomRoleError,
    );
  });

  it('rejects unknown flag strings', () => {
    expect(() => assertCustomRoleFlags(['kds.view', 'something.else'])).toThrow(
      InvalidCustomRoleError,
    );
  });

  it('surfaces every offending entry in the error payload', () => {
    try {
      assertCustomRoleFlags(['billing.manage', 'nope']);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCustomRoleError);
      const err = error as InvalidCustomRoleError;
      expect(err.invalidFlags).toEqual(['billing.manage', 'nope']);
    }
  });
});

describe('isFlag', () => {
  it('returns true for legal flag strings', () => {
    expect(isFlag('kds.view')).toBe(true);
  });

  it('returns false for anything else', () => {
    expect(isFlag('')).toBe(false);
    expect(isFlag('unknown.flag')).toBe(false);
    expect(isFlag(null)).toBe(false);
    expect(isFlag(123)).toBe(false);
  });
});
