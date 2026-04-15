/**
 * KDS station resolution helpers. Pure utilities used at order placement
 * time to snapshot which station an order line should appear on.
 *
 * Resolution order: item-level override → category-level routing → null
 * (which the KDS treats as "show on every station / no specific routing").
 */

export function resolvePrimaryStationId<T extends string | { toString(): string }>(
  itemStationIds: readonly T[] | null | undefined,
  categoryStationIds: readonly T[] | null | undefined,
): T | null {
  if (itemStationIds && itemStationIds.length > 0) return itemStationIds[0]!;
  if (categoryStationIds && categoryStationIds.length > 0) return categoryStationIds[0]!;
  return null;
}

/**
 * Compute the order-level status implied by per-line statuses. Useful when
 * advancing an order whose lines are at different stations.
 *
 * Rule: order is `ready` only if every line is ready. If any line is
 * `preparing`, the order is `preparing`. Otherwise it's still `received`.
 */
import type { OrderLineStatus } from './domain';
export type DerivedOrderStage = OrderLineStatus;

export function deriveOrderStage(lineStatuses: readonly OrderLineStatus[]): DerivedOrderStage {
  if (lineStatuses.length === 0) return 'received';
  if (lineStatuses.every((s) => s === 'ready')) return 'ready';
  if (lineStatuses.some((s) => s === 'preparing' || s === 'ready')) return 'preparing';
  return 'received';
}
