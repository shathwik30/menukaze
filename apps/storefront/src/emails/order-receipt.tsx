import { EmailShell, emailStyles } from './shared';

interface Props {
  restaurantName: string;
  publicOrderId: string;
  paidAt: string;
  items: Array<{ name: string; quantity: number; lineTotalLabel: string }>;
  subtotalLabel: string;
  taxLabel: string;
  totalLabel: string;
  paymentMethodLabel: string;
}

export function OrderReceiptEmail({
  restaurantName,
  publicOrderId,
  paidAt,
  items,
  subtotalLabel,
  taxLabel,
  totalLabel,
  paymentMethodLabel,
}: Props) {
  return (
    <EmailShell preheader={`Receipt for order ${publicOrderId}`} restaurantName={restaurantName}>
      <h1 style={emailStyles.heading}>Receipt</h1>
      <p style={emailStyles.muted}>
        Order <strong>{publicOrderId}</strong> · paid {paidAt}
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
            <td style={emailStyles.cell}>Subtotal</td>
            <td style={{ ...emailStyles.cell, textAlign: 'right' as const }}>{subtotalLabel}</td>
          </tr>
          <tr>
            <td style={emailStyles.cell}>Tax</td>
            <td style={{ ...emailStyles.cell, textAlign: 'right' as const }}>{taxLabel}</td>
          </tr>
          <tr>
            <td
              style={{
                ...emailStyles.cell,
                fontWeight: 700,
                borderBottom: 'none',
              }}
            >
              Total paid
            </td>
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

      <p style={{ marginTop: '16px', fontSize: '13px', color: '#71717a' }}>
        Payment method: {paymentMethodLabel}
      </p>
      <p style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '16px' }}>
        This receipt is for your records. Please keep it for any refund or support inquiries.
      </p>
    </EmailShell>
  );
}
