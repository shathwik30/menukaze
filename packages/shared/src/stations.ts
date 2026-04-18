import type { OrderLineStatus } from './domain';

export function resolvePrimaryStationId<T extends string | { toString(): string }>(
  itemStationIds: readonly T[] | null | undefined,
  categoryStationIds: readonly T[] | null | undefined,
): T | null {
  if (itemStationIds && itemStationIds.length > 0) return itemStationIds[0]!;
  if (categoryStationIds && categoryStationIds.length > 0) return categoryStationIds[0]!;
  return null;
}

export type DerivedOrderStage = OrderLineStatus;

export function deriveOrderStage(lineStatuses: readonly OrderLineStatus[]): DerivedOrderStage {
  if (lineStatuses.length === 0) return 'received';
  if (lineStatuses.every((s) => s === 'ready')) return 'ready';
  if (lineStatuses.some((s) => s === 'preparing' || s === 'ready')) return 'preparing';
  return 'received';
}
