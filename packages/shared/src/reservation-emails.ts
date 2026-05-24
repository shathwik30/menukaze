import { createElement, type CSSProperties, type ReactElement } from 'react';

const styles = {
  shell: {
    margin: '0 auto',
    maxWidth: '560px',
    borderRadius: '24px',
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    padding: '32px',
    fontFamily: 'Arial, sans-serif',
    color: '#1c1917',
  },
  eyebrow: {
    margin: '0 0 12px',
    color: '#9a3412',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  heading: {
    margin: '0 0 12px',
    color: '#431407',
    fontSize: '28px',
    lineHeight: '34px',
  },
  muted: {
    margin: '0 0 20px',
    color: '#57534e',
    fontSize: '15px',
    lineHeight: '24px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    borderRadius: '16px',
    overflow: 'hidden',
    background: '#ffffff',
    border: '1px solid #fed7aa',
  },
  cell: {
    padding: '13px 14px',
    borderBottom: '1px solid #ffedd5',
    color: '#44403c',
    fontSize: '14px',
  },
  strongCell: {
    padding: '13px 14px',
    borderBottom: '1px solid #ffedd5',
    color: '#1c1917',
    fontSize: '14px',
    fontWeight: 700,
    textAlign: 'right',
  },
  footer: {
    margin: '18px 0 0',
    color: '#78716c',
    fontSize: '12px',
    lineHeight: '18px',
  },
} satisfies Record<string, CSSProperties>;

interface ReservationReminderEmailProps {
  restaurantName: string;
  customerName: string;
  dateLabel: string;
  slotLabel: string;
  partySize: number;
}

function row(label: string, value: string | number): ReactElement {
  return createElement(
    'tr',
    null,
    createElement('td', { style: styles.cell }, label),
    createElement('td', { style: styles.strongCell }, value),
  );
}

export function ReservationReminderEmail({
  restaurantName,
  customerName,
  dateLabel,
  slotLabel,
  partySize,
}: ReservationReminderEmailProps): ReactElement {
  const firstName = customerName.trim().split(/\s+/)[0] ?? customerName;

  return createElement(
    'div',
    { style: styles.shell },
    createElement('p', { style: styles.eyebrow }, restaurantName),
    createElement('h1', { style: styles.heading }, `Your table is coming up, ${firstName}.`),
    createElement(
      'p',
      { style: styles.muted },
      `This is a reminder for your reservation at ${restaurantName}.`,
    ),
    createElement(
      'table',
      { style: styles.table },
      createElement(
        'tbody',
        null,
        row('Date', dateLabel),
        row('Time', slotLabel),
        row('Guests', partySize),
      ),
    ),
    createElement(
      'p',
      { style: styles.footer },
      'Need to change or cancel? Reply to this email and the restaurant will help.',
    ),
  );
}
