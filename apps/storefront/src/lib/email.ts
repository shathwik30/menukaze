import 'server-only';
import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';

/**
 * Thin Resend wrapper used by every outbound transactional mail in the
 * storefront. Honours `MENUKAZE_SKIP_EMAIL=true` so local smoke tests run
 * offline without consuming Resend quota, and logs the subject/recipient of
 * each send for debugging.
 */

let client: Resend | null = null;
function getResend(): Resend {
  if (client) return client;
  const key = process.env['RESEND_API_KEY'];
  if (!key) throw new Error('Missing RESEND_API_KEY');
  client = new Resend(key);
  return client;
}

export interface SendTransactionalInput {
  to: string;
  subject: string;
  /** Optional reply-to (e.g., the restaurant's support email). */
  replyTo?: string;
  /** React element to render — templates in apps/storefront/src/emails. */
  react: ReactElement;
}

export async function sendTransactionalEmail(input: SendTransactionalInput): Promise<void> {
  if (process.env['MENUKAZE_SKIP_EMAIL'] === 'true') {
    console.info(`[email:skip] to=${input.to} subject="${input.subject}"`);
    return;
  }

  const from = process.env['RESEND_FROM_ADDRESS'] ?? 'Menukaze <onboarding@resend.dev>';
  const html = await render(input.react);
  const text = await render(input.react, { plainText: true });

  const resend = getResend();
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html,
    text,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }
}
