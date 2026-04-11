import 'server-only';
import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';

let client: Resend | null = null;
function getResend(): Resend {
  if (client) return client;
  const key = process.env['RESEND_API_KEY'];
  if (!key) throw new Error('Missing RESEND_API_KEY');
  client = new Resend(key);
  return client;
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<void> {
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
  });
  if (result.error) throw new Error(`Resend send failed: ${result.error.message}`);
}
