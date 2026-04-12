import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const restaurantFindExec = vi.fn();
  const tableSessionFindExec = vi.fn();

  return {
    getMongoConnection: vi.fn(),
    getModels: vi.fn(),
    getRestaurantSupportRecipients: vi.fn(),
    publishRealtimeEvent: vi.fn(),
    Restaurant: {
      find: vi.fn(() => ({
        lean: () => ({ exec: restaurantFindExec }),
      })),
    },
    TableSession: {
      find: vi.fn(() => ({
        sort: () => ({
          limit: () => ({
            lean: () => ({ exec: tableSessionFindExec }),
          }),
        }),
      })),
      updateOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(undefined) })),
    },
    Table: {
      updateOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(undefined) })),
    },
    Order: {
      updateMany: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(undefined) })),
    },
    restaurantFindExec,
    tableSessionFindExec,
  };
});

vi.mock('@menukaze/db', () => ({
  getMongoConnection: mocks.getMongoConnection,
  getModels: mocks.getModels,
  getRestaurantSupportRecipients: mocks.getRestaurantSupportRecipients,
}));

vi.mock('@menukaze/realtime/server', () => ({
  publishRealtimeEvent: mocks.publishRealtimeEvent,
}));

import { sweepTimedOutSessions, TIMED_OUT_PAYMENT_FAILURE_REASON } from './session-sweeper';

describe('sweepTimedOutSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMongoConnection.mockResolvedValue({});
    mocks.getRestaurantSupportRecipients.mockResolvedValue(null);
    mocks.getModels.mockReturnValue({
      Restaurant: mocks.Restaurant,
      TableSession: mocks.TableSession,
      Table: mocks.Table,
      Order: mocks.Order,
    });
  });

  it('moves expired unpaid sessions to needs_review', async () => {
    const restaurantId = '507f1f77bcf86cd799439011';
    const tableId = '507f1f77bcf86cd799439012';
    const sessionId = '507f1f77bcf86cd799439013';
    const now = new Date('2026-04-12T12:00:00.000Z');

    mocks.tableSessionFindExec.mockResolvedValue([
      {
        _id: sessionId,
        restaurantId,
        tableId,
        status: 'bill_requested',
        lastActivityAt: new Date('2026-04-12T08:00:00.000Z'),
      },
    ]);
    mocks.restaurantFindExec.mockResolvedValue([
      {
        _id: restaurantId,
        dineInSessionTimeoutMinutes: 180,
      },
    ]);

    const result = await sweepTimedOutSessions(now);

    expect(result).toEqual({ scanned: 1, expired: 1 });
    const updateCalls = mocks.Order.updateMany.mock.calls as unknown as Array<
      [unknown, { $set: Record<'payment.status' | 'payment.failureReason', string> }]
    >;
    const update = (updateCalls[0]?.[1] ?? null) as {
      $set: Record<'payment.status' | 'payment.failureReason', string>;
    };
    expect(update).not.toBeNull();
    expect(update.$set['payment.status']).toBe('failed');
    expect(update.$set['payment.failureReason']).toBe(TIMED_OUT_PAYMENT_FAILURE_REASON);
    expect(mocks.TableSession.updateOne).toHaveBeenCalledWith(
      { restaurantId, _id: sessionId },
      { $set: { status: 'needs_review', closedAt: now } },
    );
    expect(mocks.Table.updateOne).toHaveBeenCalledWith(
      { restaurantId, _id: tableId },
      { $set: { status: 'needs_review' } },
    );
    expect(mocks.publishRealtimeEvent).toHaveBeenCalledTimes(2);
  });

  it('leaves fresh sessions untouched', async () => {
    const restaurantId = '507f1f77bcf86cd799439011';

    mocks.tableSessionFindExec.mockResolvedValue([
      {
        _id: '507f1f77bcf86cd799439013',
        restaurantId,
        tableId: '507f1f77bcf86cd799439012',
        status: 'active',
        lastActivityAt: new Date('2026-04-12T11:00:00.000Z'),
      },
    ]);
    mocks.restaurantFindExec.mockResolvedValue([
      {
        _id: restaurantId,
        dineInSessionTimeoutMinutes: 180,
      },
    ]);

    const result = await sweepTimedOutSessions(new Date('2026-04-12T12:00:00.000Z'));

    expect(result).toEqual({ scanned: 1, expired: 0 });
    expect(mocks.Order.updateMany).not.toHaveBeenCalled();
    expect(mocks.publishRealtimeEvent).not.toHaveBeenCalled();
  });
});
