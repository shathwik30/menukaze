import { describe, expect, it } from 'vitest';
import type { OrderLineStatus } from './domain';
import { deriveOrderStage, resolvePrimaryStationId } from './stations';

describe('resolvePrimaryStationId', () => {
  it('prefers the item-level station when present', () => {
    expect(resolvePrimaryStationId(['item-station'], ['cat-station'])).toBe('item-station');
  });

  it('falls back to the category-level station', () => {
    expect(resolvePrimaryStationId(null, ['cat-station'])).toBe('cat-station');
    expect(resolvePrimaryStationId([], ['cat-station'])).toBe('cat-station');
  });

  it('returns null when neither source has a station', () => {
    expect(resolvePrimaryStationId(null, null)).toBeNull();
    expect(resolvePrimaryStationId([], [])).toBeNull();
  });
});

describe('deriveOrderStage', () => {
  it('returns received for an empty line list', () => {
    expect(deriveOrderStage([])).toBe('received');
  });

  it('returns ready only when every line is ready', () => {
    expect(deriveOrderStage(['ready', 'ready', 'ready'] as OrderLineStatus[])).toBe('ready');
    expect(deriveOrderStage(['ready', 'preparing'] as OrderLineStatus[])).not.toBe('ready');
  });

  it('returns preparing when any line is preparing or ready but not all ready', () => {
    expect(deriveOrderStage(['preparing', 'received'] as OrderLineStatus[])).toBe('preparing');
    expect(deriveOrderStage(['received', 'ready'] as OrderLineStatus[])).toBe('preparing');
  });

  it('returns received when every line is still received', () => {
    expect(deriveOrderStage(['received', 'received'] as OrderLineStatus[])).toBe('received');
  });
});
