import type { StaffRole } from '@menukaze/shared';
import { ALL_FLAGS, FLAGS, OWNER_ONLY_FLAGS, isFlag, type Flag } from './flags';

export type { StaffRole };

const flagSet = (...flags: Flag[]): ReadonlySet<Flag> => new Set(flags);

const OWNER: ReadonlySet<Flag> = ALL_FLAGS;

const MANAGER: ReadonlySet<Flag> = new Set<Flag>(
  FLAGS.filter((flag) => !OWNER_ONLY_FLAGS.has(flag)),
);

const WAITER: ReadonlySet<Flag> = flagSet(
  'menu.view',
  'menu.toggle_availability',
  'tables.view',
  'reservations.view',
  'reservations.edit',
  'orders.view_assigned',
  'orders.update_status',
  'orders.create_walkin',
  'kds.view',
  'payments.process',
  'customers.view_current_only',
  'audit.view_self',
);

const KITCHEN: ReadonlySet<Flag> = flagSet(
  'menu.view',
  'menu.toggle_availability',
  'orders.view_assigned',
  'orders.update_status',
  'kds.view',
  'kds.update',
  'audit.view_self',
);

const CASHIER: ReadonlySet<Flag> = flagSet(
  'menu.view',
  'tables.view',
  'reservations.view',
  'orders.view_all',
  'orders.update_status',
  'orders.cancel',
  'orders.refund',
  'orders.create_walkin',
  'kds.view',
  'channels.view',
  'payments.process',
  'analytics.view_today_only',
  'customers.view_current_only',
  'audit.view_self',
);

export const ROLE_FLAGS: Record<Exclude<StaffRole, 'custom'>, ReadonlySet<Flag>> = {
  owner: OWNER,
  manager: MANAGER,
  waiter: WAITER,
  kitchen: KITCHEN,
  cashier: CASHIER,
};

export interface MembershipForResolve {
  role: StaffRole;
  customPermissions?: readonly string[];
}

export function resolveFlags(membership: MembershipForResolve): ReadonlySet<Flag> {
  if (membership.role === 'custom') {
    const valid = new Set<Flag>();
    for (const candidate of membership.customPermissions ?? []) {
      if (isFlag(candidate)) valid.add(candidate);
    }
    return valid;
  }
  return ROLE_FLAGS[membership.role];
}

export function hasAllFlags(membership: MembershipForResolve, required: readonly Flag[]): boolean {
  const set = resolveFlags(membership);
  return required.every((flag) => set.has(flag));
}

export function hasAnyFlag(membership: MembershipForResolve, required: readonly Flag[]): boolean {
  const set = resolveFlags(membership);
  return required.some((flag) => set.has(flag));
}
