import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (resendClient) return resendClient;

  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) throw new Error('Missing RESEND_API_KEY');

  resendClient = new Resend(apiKey);
  return resendClient;
}

export interface TransactionalEmailInput {
  to: string;
  subject: string;
  replyTo?: string;
  react: ReactElement;
}

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<void> {
  if (process.env['MENUKAZE_SKIP_EMAIL'] === 'true') {
    console.info(`[email:skip] to=${input.to} subject="${input.subject}"`);
    return;
  }

  const from = process.env['RESEND_FROM_ADDRESS'] ?? 'Menukaze <onboarding@resend.dev>';
  const html = await render(input.react);
  const text = await render(input.react, { plainText: true });

  const result = await getResendClient().emails.send({
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
