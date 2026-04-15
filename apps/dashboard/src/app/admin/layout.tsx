import type { ReactNode } from 'react';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboardedRestaurant } from '@/lib/session';
import { signOutAction } from '@/app/actions/auth';
import { AdminShell, type NavGroup } from './_components/admin-shell';
import { NavIcon } from './_components/nav-icons';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { session, restaurantId } = await requireOnboardedRestaurant();
  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).lean().exec();

  const has = (flag: (typeof session.permissions)[number]) => session.permissions.includes(flag);
  const canViewSettings = session.permissions.some((flag) => flag.startsWith('settings.'));
  const canManageData = has('customers.export') || has('customers.delete');

  const groups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { href: '/admin', label: 'Dashboard', visible: true, icon: <NavIcon.Dashboard /> },
        {
          href: '/admin/analytics',
          label: 'Analytics',
          visible: has('analytics.view'),
          icon: <NavIcon.Analytics />,
        },
      ],
    },
    {
      label: 'Operations',
      items: [
        {
          href: '/admin/orders',
          label: 'Orders',
          visible: has('orders.view_all'),
          icon: <NavIcon.Orders />,
        },
        {
          href: '/admin/kds',
          label: 'Kitchen display',
          visible: has('kds.view'),
          icon: <NavIcon.Kitchen />,
        },
        {
          href: '/admin/stations',
          label: 'Stations',
          visible: has('kds.configure'),
          icon: <NavIcon.Stations />,
        },
        {
          href: '/admin/reservations',
          label: 'Reservations',
          visible: has('reservations.view'),
          icon: <NavIcon.Reservations />,
        },
      ],
    },
    {
      label: 'Catalog',
      items: [
        { href: '/admin/menu', label: 'Menu', visible: has('menu.view'), icon: <NavIcon.Menu /> },
        {
          href: '/admin/tables',
          label: 'Tables & QR',
          visible: has('tables.view'),
          icon: <NavIcon.Tables />,
        },
      ],
    },
    {
      label: 'Customers',
      items: [
        {
          href: '/admin/customers',
          label: 'Customer list',
          visible: has('customers.view'),
          icon: <NavIcon.Customers />,
        },
        {
          href: '/admin/feedback',
          label: 'Feedback',
          visible: has('analytics.view'),
          icon: <NavIcon.Feedback />,
        },
        {
          href: '/admin/data-requests',
          label: 'Data requests',
          visible: canManageData,
          icon: <NavIcon.Data />,
        },
      ],
    },
    {
      label: 'Team & Admin',
      items: [
        {
          href: '/admin/staff',
          label: 'Staff',
          visible: has('staff.view'),
          icon: <NavIcon.Staff />,
        },
        {
          href: '/admin/settings',
          label: 'Settings',
          visible: canViewSettings,
          icon: <NavIcon.Settings />,
        },
        {
          href: '/admin/audit',
          label: 'Audit log',
          visible: has('audit.view_self') || has('audit.view_all'),
          icon: <NavIcon.Audit />,
        },
      ],
    },
    {
      label: 'Developers',
      items: [
        {
          href: '/admin/api-keys',
          label: 'API keys',
          visible: has('api_keys.manage'),
          icon: <NavIcon.Keys />,
        },
        {
          href: '/admin/webhooks',
          label: 'Webhooks',
          visible: has('webhooks.manage'),
          icon: <NavIcon.Webhook />,
        },
      ],
    },
  ];

  return (
    <AdminShell
      restaurantName={restaurant?.name ?? 'Menukaze'}
      restaurantSlug={restaurant?.slug ?? 'demo'}
      userEmail={session.user.email}
      userName={session.user.name}
      groups={groups}
      signOutAction={signOutAction}
    >
      {children}
    </AdminShell>
  );
}
