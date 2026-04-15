interface Props {
  restaurantName: string;
  tableName: string;
  customerName: string;
  totalLabel: string;
  happenedAt: string;
}

/**
 * Staff-facing alert: a dine-in session timed out before the customer
 * completed payment and needs manual reconciliation from the dashboard.
 */
export function SessionNeedsReviewEmail({
  restaurantName,
  tableName,
  customerName,
  totalLabel,
  happenedAt,
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
            <h1 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>
              Payment review needed
            </h1>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#71717a' }}>
              {restaurantName} · {tableName} · {happenedAt}
            </p>
            <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>
              {customerName}&apos;s dine-in session timed out before payment completed.
            </p>
            <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>
              Outstanding total: <strong>{totalLabel}</strong>
            </p>
            <p style={{ margin: 0, fontSize: 14 }}>
              Open the dashboard and settle the table manually before releasing it.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
