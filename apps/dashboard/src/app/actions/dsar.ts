'use server';

import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { runRestaurantAction, validationError, type ActionResult } from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const PERMISSION_ERROR = 'You do not have permission to export customer data.';

const exportInput = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

export interface DsarBundle {
  generatedAt: string;
  restaurantId: string;
  customerEmail: string;
  profile: {
    name: string;
    email: string;
    phone?: string;
  } | null;
  orders: Array<{
    id: string;
    publicOrderId: string;
    channel: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    currency: string;
    subtotalMinor: number;
    taxMinor: number;
    tipMinor: number;
    totalMinor: number;
    items: Array<{
      name: string;
      quantity: number;
      priceMinor: number;
      lineTotalMinor: number;
      modifiers: Array<{ groupName: string; optionName: string; priceMinor: number }>;
      notes?: string;
    }>;
    payment: {
      gateway: string;
      status: string;
      methodLabel?: string;
      paidAt: string | null;
    };
  }>;
  tableSessions: Array<{
    id: string;
    status: string;
    startedAt: string;
    closedAt: string | null;
    paidAt: string | null;
    customer: { name: string; email: string; phone?: string };
  }>;
}

// DSAR bundle: all Orders + TableSessions for one customer.email on this tenant.
export async function exportCustomerDataAction(raw: unknown): Promise<ActionResult<DsarBundle>> {
  const parsed = exportInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  return runRestaurantAction(
    ['customers.export'],
    { onError: 'Failed to export customer data.', onForbidden: PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Order, TableSession } = getModels(conn);
      const email = parsed.data.email;

      const [orders, sessions] = await Promise.all([
        Order.find({ 'customer.email': email }).sort({ createdAt: -1 }).lean().exec(),
        TableSession.find({ 'customer.email': email }).sort({ startedAt: -1 }).lean().exec(),
      ]);

      const profileSource = orders[0]?.customer ?? sessions[0]?.customer ?? null;

      const bundle: DsarBundle = {
        generatedAt: new Date().toISOString(),
        restaurantId: String(restaurantId),
        customerEmail: email,
        profile: profileSource
          ? {
              name: profileSource.name,
              email: profileSource.email,
              ...(profileSource.phone ? { phone: profileSource.phone } : {}),
            }
          : null,
        orders: orders.map((o) => ({
          id: String(o._id),
          publicOrderId: o.publicOrderId,
          channel: o.channel,
          type: o.type,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
          completedAt: o.completedAt ? o.completedAt.toISOString() : null,
          currency: o.currency,
          subtotalMinor: o.subtotalMinor,
          taxMinor: o.taxMinor,
          tipMinor: o.tipMinor,
          totalMinor: o.totalMinor,
          items: o.items.map((line) => ({
            name: line.name,
            quantity: line.quantity,
            priceMinor: line.priceMinor,
            lineTotalMinor: line.lineTotalMinor,
            modifiers: (line.modifiers ?? []).map((m) => ({
              groupName: m.groupName,
              optionName: m.optionName,
              priceMinor: m.priceMinor,
            })),
            ...(line.notes ? { notes: line.notes } : {}),
          })),
          payment: {
            gateway: o.payment.gateway,
            status: o.payment.status,
            ...(o.payment.methodLabel ? { methodLabel: o.payment.methodLabel } : {}),
            paidAt: o.payment.paidAt ? o.payment.paidAt.toISOString() : null,
          },
        })),
        tableSessions: sessions.map((s) => ({
          id: String(s._id),
          status: s.status,
          startedAt: s.startedAt.toISOString(),
          closedAt: s.closedAt ? s.closedAt.toISOString() : null,
          paidAt: s.paidAt ? s.paidAt.toISOString() : null,
          customer: {
            name: s.customer.name,
            email: s.customer.email,
            ...(s.customer.phone ? { phone: s.customer.phone } : {}),
          },
        })),
      };

      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'customer.data.exported',
        resourceType: 'customer',
        metadata: {
          email,
          orderCount: orders.length,
          sessionCount: sessions.length,
        },
      });

      return { ok: true, data: bundle };
    },
  );
}

const deleteInput = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  confirm: z.literal('DELETE'),
});

export interface DsarDeletionSummary {
  email: string;
  ordersAnonymised: number;
  sessionsAnonymised: number;
}

// Anonymises name/email/phone on past orders and sessions. Totals, items,
// and statuses are preserved (required for tax/accounting).
export async function deleteCustomerDataAction(
  raw: unknown,
): Promise<ActionResult<DsarDeletionSummary>> {
  const parsed = deleteInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  return runRestaurantAction(
    ['customers.delete'],
    { onError: 'Failed to delete customer data.', onForbidden: PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Order, TableSession } = getModels(conn);
      const email = parsed.data.email;
      const anonName = 'Redacted Customer';
      const anonEmail = `redacted+${String(restaurantId).slice(-6)}@menukaze.invalid`;

      const [orderResult, sessionResult] = await Promise.all([
        Order.updateMany(
          { 'customer.email': email },
          {
            $set: { 'customer.name': anonName, 'customer.email': anonEmail },
            $unset: { 'customer.phone': 1 },
          },
        ).exec(),
        TableSession.updateMany(
          { 'customer.email': email },
          {
            $set: { 'customer.name': anonName, 'customer.email': anonEmail },
            $unset: { 'customer.phone': 1 },
          },
        ).exec(),
      ]);

      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'customer.data.deleted',
        resourceType: 'customer',
        metadata: {
          email,
          ordersAnonymised: orderResult.modifiedCount,
          sessionsAnonymised: sessionResult.modifiedCount,
        },
      });

      return {
        ok: true,
        data: {
          email,
          ordersAnonymised: orderResult.modifiedCount,
          sessionsAnonymised: sessionResult.modifiedCount,
        },
      };
    },
  );
}
