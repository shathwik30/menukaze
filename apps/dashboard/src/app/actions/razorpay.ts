'use server';

import { z } from 'zod';
import { envelopeEncrypt, getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { runRestaurantAction, validationError } from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';
import { verifyRazorpayKeys } from '@/lib/razorpay';

const RAZORPAY_PERMISSION_ERROR = 'You do not have permission to configure payments.';

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

export async function connectRazorpayAction(raw: unknown): Promise<ConnectRazorpayResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error, 'Invalid form data.');
  const { keyId, keySecret } = parsed.data;

  return runRestaurantAction(
    ['payments.configure'],
    { onError: 'Could not save Razorpay credentials.', onForbidden: RAZORPAY_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
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

      const encKeyId = envelopeEncrypt(keyId);
      const encSecret = envelopeEncrypt(keySecret);

      const result = await Restaurant.updateOne(
        { _id: restaurantId },
        {
          $set: {
            razorpayKeyIdEnc: encKeyId,
            razorpayKeySecretEnc: encSecret,
            onboardingStep: 'staff',
          },
        },
      ).exec();
      if (result.matchedCount !== 1) throw new APIError('internal_error');

      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'payments.razorpay.connected',
        resourceType: 'restaurant',
        resourceId: String(restaurantId),
        metadata: { keyIdMasked: `${keyId.slice(0, 12)}…` },
      });

      return { ok: true };
    },
  );
}
