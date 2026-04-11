import 'server-only';
import Razorpay from 'razorpay';
import { envelopeDecrypt, type RestaurantDoc } from '@menukaze/db';
import type { HydratedDocument } from 'mongoose';

/**
 * Build a Razorpay SDK client from a restaurant's encrypted credentials.
 * Returns null if the restaurant hasn't connected a gateway — callers must
 * treat that case as "checkout unavailable".
 *
 * Called per-request inside server actions, not memoized, because credentials
 * are per-tenant and may rotate.
 */
export function getRazorpayClient(
  restaurant: HydratedDocument<RestaurantDoc>,
): { client: Razorpay; keyId: string; keySecret: string } | null {
  const keyIdEnc = restaurant.razorpayKeyIdEnc;
  const keySecretEnc = restaurant.razorpayKeySecretEnc;
  if (!keyIdEnc || !keySecretEnc) return null;
  const keyId = envelopeDecrypt(keyIdEnc);
  const keySecret = envelopeDecrypt(keySecretEnc);
  return {
    client: new Razorpay({ key_id: keyId, key_secret: keySecret }),
    keyId,
    keySecret,
  };
}
