interface Props {
  restaurantName: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; lineTotalLabel: string }>;
  totalLabel: string;
  paidAt: string;
}

/**
 * Emailed receipt for a completed dine-in session. Renders the combined
 * round view (all items placed during the session) rather than a single
 * order snapshot.
 */
export function SessionReceiptEmail({
  restaurantName,
  customerName,
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
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td
                      style={{ padding: '8px 0', borderBottom: '1px solid #f4f4f5', fontSize: 14 }}
                    >
                      {it.quantity}× {it.name}
                    </td>
                    <td
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid #f4f4f5',
                        fontSize: 14,
                        textAlign: 'right',
                      }}
                    >
                      {it.lineTotalLabel}
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
          <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: 12, marginTop: 24 }}>
            {restaurantName} · Powered by Menukaze
          </p>
        </div>
      </body>
    </html>
  );
}
