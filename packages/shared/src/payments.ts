/**
 * The single payment-gateway interface every adapter implements.
 *
 * The PaymentGatewayInterface is the contract for the pluggable adapter pattern
 * that lets us add new gateways without
 * touching the rest of the system. Razorpay and Cash are the launch adapters.
 */

import type { CurrencyCode } from './currency';

export type GatewayId = 'razorpay' | 'cash';

export interface CreateIntentInput {
  /** Always integer minor units. Never floats. */
  amountMinor: number;
  currency: CurrencyCode;
  /** Stable identifier the gateway echoes back so we can correlate webhooks. */
  idempotencyKey: string;
  /** Free-form metadata stored on the gateway side. */
  metadata?: Record<string, string>;
  /** Customer email used by gateways for receipts and fraud signals. */
  customerEmail?: string;
}

export interface PaymentIntent {
  id: string;
  clientSecret?: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: CurrencyCode;
}

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface Payment {
  id: string;
  intentId: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: CurrencyCode;
  /** Card suffix, UPI VPA, wallet name, or whichever label the gateway exposes. */
  methodLabel?: string;
  /** Gateway transaction id, useful for support / dispute correlation. */
  externalRef?: string;
  paidAt?: Date;
}

export interface Refund {
  id: string;
  paymentId: string;
  amountMinor: number;
  currency: CurrencyCode;
  reason?: string;
  refundedAt: Date;
}

export interface PaymentMethod {
  id: 'card' | 'upi' | 'wallet' | 'netbanking' | 'emi' | 'cash' | 'qr' | 'pay_at_counter';
  label: string;
}

export interface WebhookEvent {
  id: string;
  type:
    | 'payment.initiated'
    | 'payment.completed'
    | 'payment.failed'
    | 'payment.refunded'
    | 'payment.disputed';
  paymentId?: string;
  intentId?: string;
  payload: Record<string, unknown>;
}

/**
 * Every gateway adapter implements this interface. Adapters are constructed
 * with the per-restaurant credentials (decrypted just-in-time from `restaurants.razorpayKey*Enc`).
 */
export interface PaymentGatewayInterface {
  readonly id: GatewayId;

  createPaymentIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  confirmPayment(intentId: string): Promise<Payment>;
  refund(paymentId: string, amountMinor?: number, reason?: string): Promise<Refund>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
  getSupportedMethods(country: string): PaymentMethod[];
  getSupportedCurrencies(): CurrencyCode[];

  /**
   * Verify and parse an inbound gateway webhook. Returns the normalized event.
   * Adapters MUST use a constant-time HMAC comparison against the gateway secret.
   */
  handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
}
