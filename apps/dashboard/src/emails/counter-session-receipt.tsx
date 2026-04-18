interface Props {
  restaurantName: string;
  customerName: string;
  paymentMethodLabel: string;
  items: Array<{ name: string; quantity: number; lineTotalLabel: string }>;
  totalLabel: string;
  paidAt: string;
}

export function CounterSessionReceiptEmail({
  restaurantName,
  customerName,
  paymentMethodLabel,
  items,
  totalLabel,
  paidAt,
}: Props) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#f4f4f5',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          color: '#18181b',
        }}
      >
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e4e4e7',
              borderRadius: 8,
              padding: 24,
            }}
          >
            <h1 style={{ margin: '0 0 4px 0', fontSize: 20, fontWeight: 700 }}>
              Thanks, {customerName.split(' ')[0]}!
            </h1>
            <p style={{ margin: '4px 0 16px 0', fontSize: 14, color: '#71717a' }}>
              Dine-in at {restaurantName} · paid {paidAt}
            </p>
            <p style={{ margin: '0 0 16px 0', fontSize: 14 }}>
              Payment method: <strong>{paymentMethodLabel}</strong>
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td
                      style={{ padding: '8px 0', borderBottom: '1px solid #f4f4f5', fontSize: 14 }}
                    >
                      {item.quantity}× {item.name}
                    </td>
                    <td
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid #f4f4f5',
                        fontSize: 14,
                        textAlign: 'right',
                      }}
                    >
                      {item.lineTotalLabel}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '8px 0', fontWeight: 700, fontSize: 15 }}>Total</td>
                  <td
                    style={{
                      padding: '8px 0',
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    {totalLabel}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  );
}
