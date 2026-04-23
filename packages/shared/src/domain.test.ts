import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ORDER_CHANNELS,
  canTransitionOrderStatus,
  isOrderChannel,
  isOrderStatus,
  isTableStatus,
  isTerminalOrderStatus,
  isWaiterAlertReason,
  orderChannelKind,
} from './domain';

describe('type guards', () => {
  it('isOrderStatus recognises canonical values', () => {
    expect(isOrderStatus('confirmed')).toBe(true);
    expect(isOrderStatus('nope')).toBe(false);
    expect(isOrderStatus(42)).toBe(false);
  });

  it('isOrderChannel accepts every built-in channel + api', () => {
    for (const channel of ['storefront', 'qr_dinein', 'kiosk', 'walk_in', 'api']) {
      expect(isOrderChannel(channel)).toBe(true);
    }
    expect(isOrderChannel('social')).toBe(false);
  });

  it('isTableStatus / isWaiterAlertReason are strict', () => {
    expect(isTableStatus('occupied')).toBe(true);
    expect(isTableStatus('flooded')).toBe(false);
    expect(isWaiterAlertReason('call_waiter')).toBe(true);
    expect(isWaiterAlertReason('tip_me')).toBe(false);
  });
});

describe('order FSM', () => {
  it('isTerminalOrderStatus marks completed + cancelled as terminal', () => {
    expect(isTerminalOrderStatus('completed')).toBe(true);
    expect(isTerminalOrderStatus('cancelled')).toBe(true);
    expect(isTerminalOrderStatus('preparing')).toBe(false);
  });

  it('canTransitionOrderStatus allows legal transitions only', () => {
    expect(canTransitionOrderStatus('received', 'confirmed')).toBe(true);
    expect(canTransitionOrderStatus('confirmed', 'preparing')).toBe(true);
    expect(canTransitionOrderStatus('preparing', 'ready')).toBe(true);
    expect(canTransitionOrderStatus('completed', 'preparing')).toBe(false);
    expect(canTransitionOrderStatus('cancelled', 'confirmed')).toBe(false);
  });
});

describe('orderChannelKind / BUILT_IN_ORDER_CHANNELS', () => {
  it('built-in channels get kind built_in', () => {
    for (const channel of BUILT_IN_ORDER_CHANNELS) {
      expect(orderChannelKind(channel)).toBe('built_in');
    }
  });

  it('api gets kind api', () => {
    expect(orderChannelKind('api')).toBe('api');
  });
});
