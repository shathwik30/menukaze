import { describe, expect, it } from 'vitest';
import { OWNER_ONLY_FLAGS, assertCustomRoleFlags, InvalidCustomRoleError } from './flags';
import { hasAllFlags, hasAnyFlag, resolveFlags } from './roles';

describe('predefined role flag sets', () => {
  it('owner has every flag including owner-only', () => {
    const set = resolveFlags({ role: 'owner' });
    expect(set.has('billing.manage')).toBe(true);
    expect(set.has('api_keys.manage')).toBe(true);
    expect(set.has('webhooks.manage')).toBe(true);
    expect(set.has('menu.edit')).toBe(true);
  });

  it('manager has full operational access but no owner-only flags', () => {
    const set = resolveFlags({ role: 'manager' });
    expect(set.has('menu.edit')).toBe(true);
    expect(set.has('staff.invite')).toBe(true);
    for (const flag of OWNER_ONLY_FLAGS) {
      expect(set.has(flag), `manager must NOT have ${flag}`).toBe(false);
    }
  });

  it('waiter is read-only on menu and scoped to assigned tables', () => {
    const set = resolveFlags({ role: 'waiter' });
    expect(set.has('menu.view')).toBe(true);
    expect(set.has('menu.edit')).toBe(false);
    expect(set.has('orders.view_assigned')).toBe(true);
    expect(set.has('orders.view_all')).toBe(false);
    expect(set.has('orders.cancel')).toBe(false);
    expect(set.has('payments.process')).toBe(true);
  });

  it('kitchen sees menu read-only and updates KDS', () => {
    const set = resolveFlags({ role: 'kitchen' });
    expect(set.has('kds.update')).toBe(true);
    expect(set.has('payments.process')).toBe(false);
    expect(set.has('reservations.view')).toBe(false);
  });

  it('cashier handles money + sees today-only analytics', () => {
    const set = resolveFlags({ role: 'cashier' });
    expect(set.has('orders.cancel')).toBe(true);
    expect(set.has('orders.refund')).toBe(true);
    expect(set.has('analytics.view_today_only')).toBe(true);
    expect(set.has('analytics.view')).toBe(false);
  });
});

describe('custom roles', () => {
  it('resolves only the supplied flags', () => {
    const set = resolveFlags({
      role: 'custom',
      customPermissions: ['menu.view', 'orders.view_all', 'unknown.flag'],
    });
    expect(set.has('menu.view')).toBe(true);
    expect(set.has('orders.view_all')).toBe(true);
    expect(set.has('menu.edit')).toBe(false);
    // Unknown flags are silently dropped during resolve.
    expect(set.size).toBe(2);
  });

  it('assertCustomRoleFlags throws on owner-only flags', () => {
    expect(() => assertCustomRoleFlags(['menu.view', 'billing.manage'])).toThrow(
      InvalidCustomRoleError,
    );
  });

  it('assertCustomRoleFlags throws on unknown flags', () => {
    expect(() => assertCustomRoleFlags(['menu.view', 'unknown.flag'])).toThrow(
      InvalidCustomRoleError,
    );
  });

  it('assertCustomRoleFlags accepts a valid subset', () => {
    expect(() => assertCustomRoleFlags(['menu.view', 'orders.view_all'])).not.toThrow();
  });
});

describe('hasAllFlags / hasAnyFlag', () => {
  it('hasAllFlags is strict', () => {
    expect(hasAllFlags({ role: 'manager' }, ['menu.edit', 'staff.invite'])).toBe(true);
    expect(hasAllFlags({ role: 'waiter' }, ['menu.edit'])).toBe(false);
  });

  it('hasAnyFlag is permissive', () => {
    expect(hasAnyFlag({ role: 'waiter' }, ['menu.edit', 'menu.view'])).toBe(true);
    expect(hasAnyFlag({ role: 'kitchen' }, ['payments.process', 'analytics.view'])).toBe(false);
  });
});
