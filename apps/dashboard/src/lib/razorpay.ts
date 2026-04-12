import 'server-only';
import Razorpay from 'razorpay';

/**
 * Verify a pair of Razorpay credentials by making the cheapest possible
 * authenticated API call: `orders.all(count: 1)`. If the keys are invalid,
 * Razorpay returns 401; if they're valid it returns an (possibly empty)
 * order list.
 *
 * Dev convenience: setting `MENUKAZE_SKIP_RAZORPAY_VERIFICATION=true` in
 * `.env.local` bypasses the API call so smoke tests can run without a real
 * Razorpay account. The prefix check still runs.
 */

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

  if (process.env['MENUKAZE_SKIP_RAZORPAY_VERIFICATION'] === 'true') {
    // Test-helper path: validate the key format without calling Razorpay.
    return { ok: true };
  }

  try {
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    // Smallest possible request that proves the auth header works.
    await rzp.orders.all({ count: 1 });
    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Razorpay verification failed.';
    return { ok: false, error: `Razorpay rejected those credentials: ${message}` };
  }
}
