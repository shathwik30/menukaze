interface Props {
  restaurantName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}

export function StaffInviteEmail({ restaurantName, inviterName, role, acceptUrl }: Props) {
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
              You&apos;re invited to join {restaurantName}
            </h1>
            <p style={{ margin: '8px 0 16px 0', fontSize: 14, color: '#71717a' }}>
              {inviterName} has invited you to join <strong>{restaurantName}</strong> on Menukaze as{' '}
              <strong>{role}</strong>.
            </p>
            <p style={{ margin: '16px 0', fontSize: 14 }}>
              Click the button below to accept. You&apos;ll need to sign in (or create an account
              with this email) to finish joining.
            </p>
            <p style={{ margin: '16px 0' }}>
              <a
                href={acceptUrl}
                style={{
                  display: 'inline-block',
                  padding: '10px 18px',
                  backgroundColor: '#18181b',
                  color: '#ffffff',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Accept invite
              </a>
            </p>
            <p style={{ margin: '16px 0 0 0', fontSize: 12, color: '#a1a1aa' }}>
              This link expires in 7 days. If you weren&apos;t expecting this invite you can ignore
              this email.
            </p>
          </div>
          <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: 12, marginTop: 24 }}>
            {restaurantName} · Powered by Menukaze
          </p>
        </div>
      </body>
    </html>
  );
}
