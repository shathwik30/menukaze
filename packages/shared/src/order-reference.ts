/**
 * Human-friendly pickup label for an order. Prefers the sequential
 * `pickupNumber` stored on the order (resets daily per restaurant, so kitchen
 * staff see "Order 17"). Falls back to a hash of `publicOrderId` for older
 * orders that don't have one recorded.
 */
export function formatPickupNumber(
  publicOrderIdOrOrder: string | { publicOrderId: string; pickupNumber?: number | null },
): string {
  if (typeof publicOrderIdOrOrder !== 'string') {
    if (
      publicOrderIdOrOrder.pickupNumber !== undefined &&
      publicOrderIdOrOrder.pickupNumber !== null &&
      publicOrderIdOrOrder.pickupNumber > 0
    ) {
      return String(publicOrderIdOrOrder.pickupNumber);
    }
    return hashPickupNumber(publicOrderIdOrOrder.publicOrderId);
  }
  return hashPickupNumber(publicOrderIdOrOrder);
}

function hashPickupNumber(publicOrderId: string): string {
  const normalized = publicOrderId.trim().toUpperCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return String((hash % 900) + 100);
}
