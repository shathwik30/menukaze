'use server';

import { z } from 'zod';
import { envelopeEncrypt, getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { PermissionDeniedError, requireFlags } from '@/lib/session';
import { validationError } from '@/lib/action-helpers';
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
 * Verifies Razorpay credentials, stores them encrypted, and advances onboarding.
 */
export async function connectRazorpayAction(raw: unknown): Promise<ConnectRazorpayResult> {
  let restaurantId;
  try {
    ({ restaurantId } = await requireFlags(['payments.configure']));
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return { ok: false, error: 'You do not have permission to configure payments.' };
    }
    throw error;
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error, 'Invalid form data.');
  const { keyId, keySecret } = parsed.data;

  const verify = await verifyRazorpayKeys(keyId, keySecret);
  if (!verify.ok) {
    return { ok: false, error: verify.error };
  }

  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);

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
