import { NextResponse } from 'next/server';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboardedRestaurant } from '@/lib/session';

export const dynamic = 'force-dynamic';

const MAX_QUERY_LENGTH = 80;
const RESULT_LIMIT = 6;

interface SearchResult {
  id: string;
  type: 'order' | 'customer' | 'menu' | 'table' | 'reservation' | 'staff';
  title: string;
  subtitle: string;
  href: string;
}

interface SearchSection {
  label: string;
  results: SearchResult[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeQuery(value: string | null): string {
  return (value ?? '').trim().slice(0, MAX_QUERY_LENGTH);
}

function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}

function compactSubtitle(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join(' · ');
}

export async function GET(request: Request): Promise<NextResponse<{ sections: SearchSection[] }>> {
  const { session, restaurantId } = await requireOnboardedRestaurant();
  const query = normalizeQuery(new URL(request.url).searchParams.get('q'));

  if (query.length < 2) {
    return NextResponse.json({ sections: [] });
  }

  const conn = await getMongoConnection('live');
  const { Order, Customer, Item, Table, Reservation, StaffMembership, User } = getModels(conn);
  const regex = new RegExp(escapeRegExp(query), 'i');
  const sections: SearchSection[] = [];

  if (hasPermission(session.permissions, 'orders.view_all')) {
    const orderNumber = Number.parseInt(query.replace(/^#/, ''), 10);
    const orders = await Order.find(
      {
        restaurantId,
        $or: [
          { publicOrderId: regex },
          { 'customer.name': regex },
          { 'customer.email': regex },
          { 'customer.phone': regex },
          ...(Number.isFinite(orderNumber) ? [{ pickupNumber: orderNumber }] : []),
        ],
      },
      {
        publicOrderId: 1,
        pickupNumber: 1,
        status: 1,
        channel: 1,
        createdAt: 1,
        'customer.name': 1,
      },
    )
      .sort({ createdAt: -1 })
      .limit(RESULT_LIMIT)
      .lean()
      .exec();

    sections.push({
      label: 'Orders',
      results: orders.map((order) => ({
        id: String(order._id),
        type: 'order',
        title: order.pickupNumber
          ? `#${order.pickupNumber} · ${order.publicOrderId}`
          : order.publicOrderId,
        subtitle: compactSubtitle([
          order.customer.name,
          String(order.channel).replace(/_/g, ' '),
          String(order.status).replace(/_/g, ' '),
        ]),
        href: `/admin/orders/${String(order._id)}`,
      })),
    });
  }

  if (hasPermission(session.permissions, 'customers.view')) {
    const customers = await Customer.find(
      {
        restaurantId,
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      },
      {
        name: 1,
        email: 1,
        phone: 1,
        lifetimeOrders: 1,
        lastOrderAt: 1,
      },
    )
      .sort({ lastOrderAt: -1 })
      .limit(RESULT_LIMIT)
      .lean()
      .exec();

    sections.push({
      label: 'Customers',
      results: customers.map((customer) => ({
        id: String(customer._id),
        type: 'customer',
        title: customer.name ?? customer.phone,
        subtitle: compactSubtitle([
          customer.email,
          `${customer.lifetimeOrders} order${customer.lifetimeOrders === 1 ? '' : 's'}`,
        ]),
        href: `/admin/customers/${String(customer._id)}`,
      })),
    });
  }

  if (hasPermission(session.permissions, 'menu.view')) {
    const items = await Item.find(
      {
        restaurantId,
        $or: [{ name: regex }, { description: regex }, { dietaryTags: regex }],
      },
      {
        name: 1,
        description: 1,
        soldOut: 1,
        priceMinor: 1,
        categoryId: 1,
      },
    )
      .sort({ updatedAt: -1 })
      .limit(RESULT_LIMIT)
      .lean()
      .exec();

    sections.push({
      label: 'Menu',
      results: items.map((item) => ({
        id: String(item._id),
        type: 'menu',
        title: item.name,
        subtitle: compactSubtitle([item.soldOut ? 'Sold out' : 'Available', item.description]),
        href: '/admin/menu',
      })),
    });
  }

  if (hasPermission(session.permissions, 'tables.view')) {
    const tableNumber = Number.parseInt(query, 10);
    const tables = await Table.find(
      {
        restaurantId,
        $or: [
          { name: regex },
          { zone: regex },
          ...(Number.isFinite(tableNumber) ? [{ number: tableNumber }] : []),
        ],
      },
      {
        number: 1,
        name: 1,
        capacity: 1,
        zone: 1,
        status: 1,
      },
    )
      .sort({ number: 1 })
      .limit(RESULT_LIMIT)
      .lean()
      .exec();

    sections.push({
      label: 'Tables',
      results: tables.map((table) => ({
        id: String(table._id),
        type: 'table',
        title: table.name,
        subtitle: compactSubtitle([
          `Table ${table.number}`,
          `${table.capacity} seats`,
          table.zone,
          String(table.status).replace(/_/g, ' '),
        ]),
        href: `/admin/tables/${String(table._id)}`,
      })),
    });
  }

  if (hasPermission(session.permissions, 'reservations.view')) {
    const reservations = await Reservation.find(
      {
        restaurantId,
        $or: [{ name: regex }, { email: regex }, { phone: regex }, { date: regex }],
      },
      {
        name: 1,
        email: 1,
        phone: 1,
        partySize: 1,
        date: 1,
        slotStart: 1,
        status: 1,
      },
    )
      .sort({ date: 1, slotStart: 1 })
      .limit(RESULT_LIMIT)
      .lean()
      .exec();

    sections.push({
      label: 'Reservations',
      results: reservations.map((reservation) => ({
        id: String(reservation._id),
        type: 'reservation',
        title: reservation.name,
        subtitle: compactSubtitle([
          `${reservation.date} ${reservation.slotStart}`,
          `${reservation.partySize} guests`,
          String(reservation.status).replace(/_/g, ' '),
        ]),
        href: '/admin/reservations',
      })),
    });
  }

  if (hasPermission(session.permissions, 'staff.view')) {
    const users = await User.find(
      { $or: [{ name: regex }, { email: regex }, { emailLower: regex }] },
      { name: 1, email: 1 },
    )
      .limit(RESULT_LIMIT)
      .lean()
      .exec();
    const userIds = users.map((user) => user._id);
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const memberships =
      userIds.length > 0
        ? await StaffMembership.find(
            {
              restaurantId,
              userId: { $in: userIds },
            },
            {
              userId: 1,
              role: 1,
              status: 1,
            },
          )
            .limit(RESULT_LIMIT)
            .lean()
            .exec()
        : [];

    sections.push({
      label: 'Staff',
      results: memberships.map((membership) => {
        const user = userById.get(String(membership.userId));
        return {
          id: String(membership._id),
          type: 'staff',
          title: user?.name ?? user?.email ?? 'Staff member',
          subtitle: compactSubtitle([
            user?.email,
            String(membership.role).replace(/_/g, ' '),
            String(membership.status).replace(/_/g, ' '),
          ]),
          href: '/admin/staff',
        };
      }),
    });
  }

  return NextResponse.json({
    sections: sections
      .map((section) => ({
        ...section,
        results: section.results.slice(0, RESULT_LIMIT),
      }))
      .filter((section) => section.results.length > 0),
  });
}
