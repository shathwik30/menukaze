import type { CurrencyCode } from './currency';
import type { PaymentGateway, PaymentStatus } from './domain';

export type { PaymentStatus };

export interface CreateIntentInput {
  amountMinor: number;
  currency: CurrencyCode;
  idempotencyKey: string;
  metadata?: Record<string, string>;
  customerEmail?: string;
}

export interface PaymentIntent {
  id: string;
  clientSecret?: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: CurrencyCode;
}

export interface Payment {
  id: string;
  intentId: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: CurrencyCode;
  methodLabel?: string;
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

export interface PaymentGatewayInterface {
  readonly id: PaymentGateway;

  createPaymentIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  confirmPayment(intentId: string): Promise<Payment>;
  refund(paymentId: string, amountMinor?: number, reason?: string): Promise<Refund>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
  getSupportedMethods(country: string): PaymentMethod[];
  getSupportedCurrencies(): CurrencyCode[];

  /** Adapters MUST use constant-time HMAC comparison against the gateway secret. */
  handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
}
