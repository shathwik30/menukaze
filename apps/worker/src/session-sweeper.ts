import { getMongoConnection, getModels, getRestaurantSupportRecipients } from '@menukaze/db';
import { channels } from '@menukaze/realtime';
import { publishRealtimeEvent } from '@menukaze/realtime/server';
import {
  formatMoney,
  isSessionExpired,
  normalizeDineInSessionTimeoutMinutes,
  type CurrencyCode,
} from '@menukaze/shared';

export const TIMED_OUT_PAYMENT_FAILURE_REASON = 'Unpaid — Requires Attention';
const MAX_SESSIONS_PER_SWEEP = 200;

export interface SweepResult {
  scanned: number;
  expired: number;
}

async function sendNeedsReviewEmail(input: {
  to: string;
  restaurantName: string;
  tableName: string;
  customerName: string;
  totalLabel: string;
  happenedAt: string;
}): Promise<void> {
  if (process.env['MENUKAZE_SKIP_EMAIL'] === 'true') {
    console.info(`[email:skip] to=${input.to} subject="Payment review needed"`);
    return;
  }

  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY');
  }

  const from = process.env['RESEND_FROM_ADDRESS'] ?? 'Menukaze <onboarding@resend.dev>';
  const subject = `Payment review needed · ${input.restaurantName} · ${input.tableName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#18181b">
      <h1>Payment review needed</h1>
      <p>${input.restaurantName} · ${input.tableName} · ${input.happenedAt}</p>
      <p>${input.customerName}'s dine-in session timed out before payment completed.</p>
      <p>Outstanding total: <strong>${input.totalLabel}</strong></p>
      <p>Open the dashboard and settle the table manually before releasing it.</p>
    </div>
  `;
  const text = [
    'Payment review needed',
    `${input.restaurantName} · ${input.tableName} · ${input.happenedAt}`,
    `${input.customerName}'s dine-in session timed out before payment completed.`,
    `Outstanding total: ${input.totalLabel}`,
    'Open the dashboard and settle the table manually before releasing it.',
  ].join('\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend send failed: ${response.status} ${body}`);
  }
}

export async function sweepTimedOutSessions(now: Date = new Date()): Promise<SweepResult> {
  const conn = await getMongoConnection('live');
  const { Restaurant, TableSession, Table, Order } = getModels(conn);

  const sessions = await TableSession.find(
    { status: { $in: ['active', 'bill_requested'] } },
    null,
    { skipTenantGuard: true },
  )
    .sort({ lastActivityAt: 1 })
    .limit(MAX_SESSIONS_PER_SWEEP)
    .lean()
    .exec();

  if (sessions.length === 0) {
    return { scanned: 0, expired: 0 };
  }

  const restaurantIds = [...new Set(sessions.map((session) => String(session.restaurantId)))];
  const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } })
    .lean()
    .exec();
  const restaurantsById = new Map(
    restaurants.map((restaurant) => [String(restaurant._id), restaurant]),
  );

  let expired = 0;

  for (const session of sessions) {
    const restaurant = restaurantsById.get(String(session.restaurantId));
    if (!restaurant) continue;

    if (
      !isSessionExpired(
        session.lastActivityAt,
        normalizeDineInSessionTimeoutMinutes(restaurant.dineInSessionTimeoutMinutes),
        now,
      )
    ) {
      continue;
    }

    expired += 1;

    await Order.updateMany(
      {
        restaurantId: session.restaurantId,
        sessionId: session._id,
        'payment.status': { $in: ['pending', 'processing'] },
      },
      {
        $set: {
          'payment.status': 'failed',
          'payment.failureReason': TIMED_OUT_PAYMENT_FAILURE_REASON,
        },
      },
    ).exec();

    await TableSession.updateOne(
      { restaurantId: session.restaurantId, _id: session._id },
      { $set: { status: 'needs_review', closedAt: now } },
    ).exec();
    await Table.updateOne(
      { restaurantId: session.restaurantId, _id: session.tableId },
      { $set: { status: 'needs_review' } },
    ).exec();

    try {
      await publishRealtimeEvent(channels.tables(String(session.restaurantId)), {
        type: 'table.status_changed',
        tableId: String(session.tableId),
        status: 'needs_review',
        changedAt: now.toISOString(),
        reason: 'timeout_unpaid',
      });
      await publishRealtimeEvent(
        channels.customerSession(String(session.restaurantId), String(session._id)),
        {
          type: 'session.updated',
          sessionId: String(session._id),
          updatedAt: now.toISOString(),
          reason: 'needs_review',
        },
      );
    } catch (error) {
      console.warn('[worker] timed-out session publish failed', error);
    }

    try {
      const recipients = await getRestaurantSupportRecipients(conn, session.restaurantId);
      if (!recipients || recipients.recipients.length === 0) {
        continue;
      }

      const [table, rounds] = await Promise.all([
        Table.findOne({ restaurantId: session.restaurantId, _id: session.tableId }).lean().exec(),
        Order.find({ restaurantId: session.restaurantId, sessionId: session._id }).lean().exec(),
      ]);
      if (!table) {
        continue;
      }

      const totalMinor = rounds.reduce((sum, round) => sum + round.totalMinor, 0);
      const totalLabel = formatMoney(
        totalMinor,
        restaurant.currency as CurrencyCode,
        restaurant.locale,
      );
      await Promise.all(
        recipients.recipients.map((to) =>
          sendNeedsReviewEmail({
            to,
            restaurantName: recipients.restaurantName,
            tableName: table.name,
            customerName: session.customer.name,
            totalLabel,
            happenedAt: now.toLocaleString(restaurant.locale, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          }),
        ),
      );
    } catch (error) {
      console.warn('[worker] timed-out session email failed', error);
    }
  }

  return {
    scanned: sessions.length,
    expired,
  };
}
