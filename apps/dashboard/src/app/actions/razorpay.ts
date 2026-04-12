'use server';

import { Types } from 'mongoose';
import { z } from 'zod';
import { envelopeEncrypt, getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { PermissionDeniedError, requireFlags } from '@/lib/session';
import { verifyRazorpayKeys } from '@/lib/razorpay';

const inputSchema = z.object({
  keyId: z
    .string()
    .trim()
    .min(10)
    .max(64)
    .regex(/^rzp_test_[A-Za-z0-9]+$/, 'Key ID must start with rzp_test_'),
  keySecret: z.string().trim().min(10).max(128),
});

export type ConnectRazorpayInput = z.infer<typeof inputSchema>;

export type ConnectRazorpayResult = { ok: true } | { ok: false; error: string };

/**
 * Step 6 of the onboarding wizard — Razorpay Connection.
 *
 * Flow:
 *   1. zod-validate the pasted keyId + keySecret
 *   2. Call the real Razorpay API to verify the keys work
 *      (bypassed in dev when MENUKAZE_SKIP_RAZORPAY_VERIFICATION=true)
 *   3. AES-256-GCM envelope-encrypt both values with ENCRYPTION_KEY
 *   4. Persist the encrypted values on the Restaurant doc
 *   5. Advance onboardingStep → 'go-live'
 *
 * The keyId and keySecret never exist unencrypted at rest — only the
 * envelope-encoded strings land in MongoDB.
 */
export async function connectRazorpayAction(raw: unknown): Promise<ConnectRazorpayResult> {
  let session;
  try {
    ({ session } = await requireFlags(['payments.configure']));
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return { ok: false, error: 'You do not have permission to configure payments.' };
    }
    throw error;
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Invalid form data.',
    };
  }
  const { keyId, keySecret } = parsed.data;

  const verify = await verifyRazorpayKeys(keyId, keySecret);
  if (!verify.ok) {
    return { ok: false, error: verify.error };
  }

  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  if (restaurant.onboardingStep !== 'razorpay') {
    return { ok: false, error: 'This restaurant has already completed the Razorpay step.' };
  }

  try {
    const encKeyId = envelopeEncrypt(keyId);
    const encSecret = envelopeEncrypt(keySecret);

    const result = await Restaurant.updateOne(
      { _id: restaurantId },
      {
        $set: {
          razorpayKeyIdEnc: encKeyId,
          razorpayKeySecretEnc: encSecret,
          onboardingStep: 'go-live',
        },
      },
    ).exec();
    if (result.matchedCount !== 1) throw new APIError('internal_error');

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return { ok: false, error: `Could not save Razorpay credentials: ${message}` };
  }
}
