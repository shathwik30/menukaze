import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyRazorpayPaymentSignature } from './razorpay';

describe('verifyRazorpayPaymentSignature', () => {
  const keySecret = 'rzp_test_secret';
  const razorpayOrderId = 'order_9A33XWu170gUtm';
  const razorpayPaymentId = 'pay_29QQoUBi66xm2f';

  function signature(orderId = razorpayOrderId, paymentId = razorpayPaymentId): string {
    return createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  }

  it('accepts a valid Razorpay payment signature', () => {
    expect(
      verifyRazorpayPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: signature(),
        keySecret,
      }),
    ).toBe(true);
  });

  it('rejects a signature for a different payment id', () => {
    expect(
      verifyRazorpayPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId: 'pay_different',
        razorpaySignature: signature(),
        keySecret,
      }),
    ).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    expect(
      verifyRazorpayPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: 'not-hex',
        keySecret,
      }),
    ).toBe(false);
  });
});
