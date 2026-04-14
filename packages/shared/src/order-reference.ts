/**
 * Builds a short customer-facing pickup number from the durable public order id.
 * The full public id remains the exact reference; this number is only for
 * kiosk/KDS callouts where a three-digit token is easier to read aloud.
 */
export function formatPickupNumber(publicOrderId: string): string {
  const normalized = publicOrderId.trim().toUpperCase();
  let hash = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }

  return String((hash % 900) + 100);
}
