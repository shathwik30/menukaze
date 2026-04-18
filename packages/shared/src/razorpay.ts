import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';

export interface EncryptedRazorpayCredentials {
  razorpayKeyIdEnc?: string | null;
  razorpayKeySecretEnc?: string | null;
}

export interface RazorpayClientBundle {
  client: Razorpay;
  keyId: string;
  keySecret: string;
}

export function getRazorpayClientFromEncryptedKeys(
  credentials: EncryptedRazorpayCredentials,
  decrypt: (value: string) => string,
): RazorpayClientBundle | null {
  const keyIdEnc = credentials.razorpayKeyIdEnc;
  const keySecretEnc = credentials.razorpayKeySecretEnc;

  if (!keyIdEnc || !keySecretEnc) return null;

  const keyId = decrypt(keyIdEnc);
  const keySecret = decrypt(keySecretEnc);

  return {
    client: new Razorpay({ key_id: keyId, key_secret: keySecret }),
    keyId,
    keySecret,
  };
}

export interface RazorpayPaymentSignatureInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  keySecret: string;
}

export function readRazorpayOrderId(order: { id?: unknown }): string {
  if (typeof order.id !== 'string' || order.id.length === 0) {
    throw new Error('Razorpay did not return an order id.');
  }
  return order.id;
}

export function verifyRazorpayPaymentSignature(input: RazorpayPaymentSignatureInput): boolean {
  const expected = createHmac('sha256', input.keySecret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest('hex');

  const expectedBytes = Buffer.from(expected, 'hex');
  const providedBytes = Buffer.from(input.razorpaySignature, 'hex');

  if (providedBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(providedBytes, expectedBytes);
}
