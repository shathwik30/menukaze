import { EmailShell, emailStyles } from './shared';

interface Props {
  restaurantName: string;
  customerName: string;
  date: string;
  slot: string;
  partySize: number;
  status: 'confirmed' | 'pending';
  notes?: string;
}

export function ReservationConfirmationEmail({
  restaurantName,
  customerName,
  date,
  slot,
  partySize,
  status,
  notes,
}: Props) {
  const firstName = customerName.split(' ')[0] ?? customerName;
  const heading =
    status === 'confirmed'
      ? `You're booked, ${firstName}!`
      : `We've received your request, ${firstName}.`;
  const body =
    status === 'confirmed'
      ? `Your table for ${partySize} at ${restaurantName} on ${date} at ${slot} is confirmed.`
      : `${restaurantName} will review your request for ${partySize} on ${date} at ${slot} and reply by email shortly.`;

  return (
    <EmailShell
      preheader={`Reservation ${status === 'confirmed' ? 'confirmed' : 'requested'} at ${restaurantName}`}
      restaurantName={restaurantName}
    >
      <h1 style={emailStyles.heading}>{heading}</h1>
      <p style={emailStyles.muted}>{body}</p>

      <table style={emailStyles.table}>
        <tbody>
          <tr>
            <td style={emailStyles.cell}>Date</td>
            <td style={{ ...emailStyles.cell, textAlign: 'right' as const }}>{date}</td>
          </tr>
          <tr>
            <td style={emailStyles.cell}>Time</td>
            <td style={{ ...emailStyles.cell, textAlign: 'right' as const }}>{slot}</td>
          </tr>
          <tr>
            <td style={emailStyles.cell}>Guests</td>
            <td style={{ ...emailStyles.cell, textAlign: 'right' as const }}>{partySize}</td>
          </tr>
        </tbody>
      </table>

      {notes ? (
        <p style={{ marginTop: '16px', fontSize: '13px', color: '#71717a' }}>
          <strong>Note from you:</strong> {notes}
        </p>
      ) : null}

      <p style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '16px' }}>
        Need to change or cancel? Reply to this email and the restaurant will help.
      </p>
    </EmailShell>
  );
}
