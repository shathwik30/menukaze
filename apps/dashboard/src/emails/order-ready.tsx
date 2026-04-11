interface Props {
  restaurantName: string;
  customerName: string;
  publicOrderId: string;
  orderType: 'pickup' | 'delivery' | 'dine_in';
  trackingUrl?: string;
}

/**
 * Outbound email sent when an operator transitions an order to `ready`.
 * Spec §13 line 844 requires "Order ready / out for delivery" emails.
 * Kept inline and styleless-beyond-inline-CSS so it renders in every
 * client — same pattern as the storefront's confirmation template.
 */
export function OrderReadyEmail({
  restaurantName,
  customerName,
  publicOrderId,
  orderType,
  trackingUrl,
}: Props) {
  const firstName = customerName.split(' ')[0] ?? customerName;
  const verb =
    orderType === 'pickup'
      ? 'is ready for pickup'
      : orderType === 'delivery'
        ? 'is heading out for delivery'
        : 'is on its way to your table';
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
              {firstName}, your order {verb}
            </h1>
            <p style={{ margin: '8px 0 16px 0', fontSize: 14, color: '#71717a' }}>
              Order <strong>{publicOrderId}</strong> at {restaurantName}.
            </p>
            {trackingUrl ? (
              <p style={{ margin: '16px 0', fontSize: 14 }}>
                <a
                  href={trackingUrl}
                  style={{
                    color: '#18181b',
                    fontWeight: 600,
                    textDecoration: 'underline',
                  }}
                >
                  View order status
                </a>
              </p>
            ) : null}
          </div>
          <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: 12, marginTop: 24 }}>
            {restaurantName} · Powered by Menukaze
          </p>
        </div>
      </body>
    </html>
  );
}
