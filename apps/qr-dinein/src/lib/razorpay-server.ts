import 'server-only';
import Razorpay from 'razorpay';
import { envelopeDecrypt, type RestaurantDoc } from '@menukaze/db';
import type { HydratedDocument } from 'mongoose';

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
