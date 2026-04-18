export const FLAGS = [
  'menu.view',
  'menu.edit',
  'menu.toggle_availability',
  'menu.schedule',

  'tables.view',
  'tables.edit',
  'tables.qr_print',

  'reservations.view',
  'reservations.edit',
  'reservations.configure',

  'orders.view_all',
  'orders.view_assigned',
  'orders.update_status',
  'orders.cancel',
  'orders.refund',
  'orders.create_walkin',

  'kds.view',
  'kds.update',
  'kds.configure',

  'channels.view',
  'channels.configure',

  'payments.process',
  'payments.configure',

  'staff.view',
  'staff.invite',
  'staff.edit',
  'staff.remove',
  'staff.manage_custom_roles',

  'analytics.view',
  'analytics.view_today_only',
  'analytics.export',

  'customers.view',
  'customers.view_current_only',
  'customers.export',
  'customers.delete',

  'settings.edit_profile',
  'settings.edit_hours',
  'settings.toggle_holiday',
  'settings.edit_delivery',
  'settings.edit_branding',
  'settings.edit_notifications',

  'api_keys.manage',
  'webhooks.manage',
  'billing.manage',

  'audit.view_self',
  'audit.view_all',
  'security.revoke_kiosk_token',
] as const;

export type Flag = (typeof FLAGS)[number];

export const ALL_FLAGS: ReadonlySet<Flag> = new Set(FLAGS);

/** Platform-critical flags that structurally cannot be delegated to a custom role. */
export const OWNER_ONLY_FLAGS: ReadonlySet<Flag> = new Set<Flag>([
  'api_keys.manage',
  'webhooks.manage',
  'billing.manage',
]);

export function isFlag(value: unknown): value is Flag {
  return typeof value === 'string' && (ALL_FLAGS as ReadonlySet<string>).has(value);
}

export class InvalidCustomRoleError extends Error {
  public constructor(public readonly invalidFlags: string[]) {
    super(`Custom role contains owner-only or unknown flags: ${invalidFlags.join(', ')}`);
    this.name = 'InvalidCustomRoleError';
  }
}

export function assertCustomRoleFlags(flags: readonly string[]): void {
  const invalid = flags.filter(
    (flag) => !isFlag(flag) || (OWNER_ONLY_FLAGS as ReadonlySet<string>).has(flag),
  );
  if (invalid.length > 0) throw new InvalidCustomRoleError(invalid);
}
