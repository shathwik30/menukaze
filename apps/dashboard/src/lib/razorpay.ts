import 'server-only';
import Razorpay from 'razorpay';
import { env } from '@/env';

// Verifies credentials by making the cheapest authenticated Razorpay call.
// `MENUKAZE_SKIP_RAZORPAY_VERIFICATION=true` skips the HTTP call for local
// smoke tests; the prefix check still runs.

export type VerifyRazorpayResult = { ok: true } | { ok: false; error: string };

export async function verifyRazorpayKeys(
  keyId: string,
  keySecret: string,
): Promise<VerifyRazorpayResult> {
  if (!keyId.startsWith('rzp_test_')) {
    return {
      ok: false,
      error: 'Only Razorpay test-mode keys are accepted in development.',
    };
  }

  if (env.MENUKAZE_SKIP_RAZORPAY_VERIFICATION) {
    return { ok: true };
  }

  try {
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    await rzp.orders.all({ count: 1 });
    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Razorpay verification failed.';
    return { ok: false, error: `Razorpay rejected those credentials: ${message}` };
  }
}
