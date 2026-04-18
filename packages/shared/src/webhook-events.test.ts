import { describe, expect, it } from 'vitest';
import {
  isWebhookEventType,
  orderWebhookApiChannel,
  orderWebhookChannel,
  webhookEventForOrderStatus,
} from './webhook-events';

describe('isWebhookEventType', () => {
  it('accepts known event types', () => {
    expect(isWebhookEventType('order.created')).toBe(true);
    expect(isWebhookEventType('reservation.cancelled')).toBe(true);
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isWebhookEventType('order.unknown')).toBe(false);
    expect(isWebhookEventType(null)).toBe(false);
    expect(isWebhookEventType(42)).toBe(false);
  });
});

describe('webhookEventForOrderStatus', () => {
  it('maps operator-driven statuses to public events', () => {
    expect(webhookEventForOrderStatus('confirmed')).toBe('order.confirmed');
    expect(webhookEventForOrderStatus('preparing')).toBe('order.preparing');
    expect(webhookEventForOrderStatus('ready')).toBe('order.ready');
    expect(webhookEventForOrderStatus('completed')).toBe('order.completed');
    expect(webhookEventForOrderStatus('cancelled')).toBe('order.cancelled');
  });

  it('returns null for transient statuses with no public counterpart', () => {
    expect(webhookEventForOrderStatus('received')).toBeNull();
    expect(webhookEventForOrderStatus('served')).toBeNull();
    expect(webhookEventForOrderStatus('out_for_delivery')).toBeNull();
    expect(webhookEventForOrderStatus('delivered')).toBeNull();
  });
});

describe('orderWebhookChannel / orderWebhookApiChannel', () => {
  it('built-in channels carry type: built_in', () => {
    expect(orderWebhookChannel('storefront')).toEqual({ id: 'storefront', type: 'built_in' });
    expect(orderWebhookChannel('qr_dinein')).toEqual({ id: 'qr_dinein', type: 'built_in' });
    expect(orderWebhookChannel('walk_in')).toEqual({ id: 'walk_in', type: 'built_in' });
  });

  it('api channel marker yields type: api', () => {
    expect(orderWebhookChannel('api')).toEqual({ id: 'api', type: 'api' });
  });

  it('orderWebhookApiChannel packages the key id, name, and api type', () => {
    expect(orderWebhookApiChannel('key_abc', 'Wordpress')).toEqual({
      id: 'key_abc',
      name: 'Wordpress',
      type: 'api',
    });
  });
});
