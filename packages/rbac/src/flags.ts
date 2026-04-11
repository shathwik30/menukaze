/**
 * The complete permission flag registry. Every capability that crosses an
 * authorization check in the system is represented here. Roles are built by
 * picking subsets of these flags. Custom roles let restaurants build their
 * own subsets at runtime.
 *
 * Flags marked OWNER_ONLY can never be granted to a Custom role — they are
 * structurally locked to the Owner so platform-critical actions cannot be
 * delegated.
 */

export const FLAGS = [
  // Menu
  'menu.view',
  'menu.edit',
  'menu.toggle_availability',
  'menu.schedule',

  // Tables
  'tables.view',
  'tables.edit',
  'tables.qr_print',

  // Reservations
  'reservations.view',
  'reservations.edit',
  'reservations.configure',

  // Orders
  'orders.view_all',
  'orders.view_assigned',
  'orders.update_status',
  'orders.cancel',
  'orders.refund',
  'orders.create_walkin',

  // KDS
  'kds.view',
  'kds.update',
  'kds.configure',

  // Channels
  'channels.view',
  'channels.configure',

  // Payments
  'payments.process',
  'payments.configure',

  // Staff
  'staff.view',
  'staff.invite',
  'staff.edit',
  'staff.remove',
  'staff.manage_custom_roles',

  // Analytics
  'analytics.view',
  'analytics.view_today_only',
  'analytics.export',

  // Customers
  'customers.view',
  'customers.view_current_only',
  'customers.export',
  'customers.delete',

  // Settings
  'settings.edit_profile',
  'settings.edit_hours',
  'settings.toggle_holiday',
  'settings.edit_delivery',
  'settings.edit_branding',
  'settings.edit_notifications',

  // Owner-only
  'api_keys.manage',
  'webhooks.manage',
  'billing.manage',

  // Audit & security
  'audit.view_self',
  'audit.view_all',
  'security.revoke_kiosk_token',
] as const;

export type Flag = (typeof FLAGS)[number];

export const ALL_FLAGS = new Set<Flag>(FLAGS);

/**
 * Flags that can never be assigned to a Custom role. Enforced by
 * `assertCustomRoleFlags` so the UI cannot offer them and the API cannot
 * accept them.
 */
export const OWNER_ONLY_FLAGS = new Set<Flag>([
  'api_keys.manage',
  'webhooks.manage',
  'billing.manage',
]);

export function isFlag(value: unknown): value is Flag {
  return typeof value === 'string' && ALL_FLAGS.has(value as Flag);
}

export class InvalidCustomRoleError extends Error {
  public constructor(public readonly invalidFlags: string[]) {
    super(`Custom role contains owner-only or unknown flags: ${invalidFlags.join(', ')}`);
    this.name = 'InvalidCustomRoleError';
  }
}

/**
 * Throws if the proposed flag set contains anything OWNER_ONLY or unknown.
 * Called when a manager creates or edits a Custom role.
 */
export function assertCustomRoleFlags(flags: readonly string[]): void {
  const invalid = flags.filter((f) => !ALL_FLAGS.has(f as Flag) || OWNER_ONLY_FLAGS.has(f as Flag));
  if (invalid.length > 0) throw new InvalidCustomRoleError(invalid);
}
