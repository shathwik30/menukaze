import { EmailShell, emailStyles } from './shared';

interface Props {
  restaurantName: string;
  customerName: string;
  publicOrderId: string;
  trackingUrl: string;
  items: Array<{ name: string; quantity: number; lineTotalLabel: string }>;
  totalLabel: string;
}

export function OrderConfirmationEmail({
  restaurantName,
  customerName,
  publicOrderId,
  trackingUrl,
  items,
  totalLabel,
}: Props) {
  const firstName = customerName.split(' ')[0] ?? customerName;
  return (
    <EmailShell
      preheader={`Your order ${publicOrderId} at ${restaurantName} is confirmed.`}
      restaurantName={restaurantName}
    >
      <h1 style={emailStyles.heading}>Thanks for your order, {firstName}!</h1>
      <p style={emailStyles.muted}>
        {restaurantName} has received your order. Reference: <strong>{publicOrderId}</strong>
      </p>

      <table style={emailStyles.table}>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td style={emailStyles.cell}>
                {item.quantity}× {item.name}
              </td>
              <td style={{ ...emailStyles.cell, textAlign: 'right' as const }}>
                {item.lineTotalLabel}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...emailStyles.cell, fontWeight: 700, borderBottom: 'none' }}>Total</td>
            <td
              style={{
                ...emailStyles.cell,
                fontWeight: 700,
                textAlign: 'right' as const,
                borderBottom: 'none',
              }}
            >
              {totalLabel}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: '24px', fontSize: '14px' }}>
        You can follow the status of your order live:
        <br />
        <a
          href={trackingUrl}
          style={{ color: '#18181b', fontWeight: 600, textDecoration: 'underline' }}
        >
          Track order {publicOrderId}
        </a>
      </p>
    </EmailShell>
  );
}
