import type { ReactNode, CSSProperties } from 'react';

/**
 * Plain JSX building blocks for transactional emails. We intentionally avoid
 * @react-email/components here — plain HTML tags with inline styles render
 * identically in Gmail / Outlook / Apple Mail without the extra bundle, and
 * @react-email/render happily walks a JSX tree built from native elements.
 */

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: '#f4f4f5',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    color: '#18181b',
  } satisfies CSSProperties,
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '24px 16px',
  } satisfies CSSProperties,
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e4e4e7',
    borderRadius: '8px',
    padding: '24px',
  } satisfies CSSProperties,
  heading: {
    fontSize: '20px',
    fontWeight: 700,
    margin: '0 0 4px 0',
  } satisfies CSSProperties,
  muted: {
    color: '#71717a',
    fontSize: '14px',
    margin: '0 0 16px 0',
  } satisfies CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginTop: '16px',
  } satisfies CSSProperties,
  cell: {
    padding: '8px 0',
    borderBottom: '1px solid #f4f4f5',
    fontSize: '14px',
  } satisfies CSSProperties,
  footer: {
    textAlign: 'center' as const,
    color: '#a1a1aa',
    fontSize: '12px',
    marginTop: '24px',
  } satisfies CSSProperties,
};

interface EmailShellProps {
  preheader: string;
  restaurantName: string;
  children: ReactNode;
}

export function EmailShell({ preheader, restaurantName, children }: EmailShellProps) {
  return (
    <html lang="en">
      <body style={styles.body}>
        <span
          style={{
            display: 'none',
            overflow: 'hidden',
            lineHeight: '1px',
            opacity: 0,
            maxHeight: 0,
            maxWidth: 0,
          }}
        >
          {preheader}
        </span>
        <div style={styles.container}>
          <div style={styles.card}>{children}</div>
          <p style={styles.footer}>{restaurantName} · Powered by Menukaze</p>
        </div>
      </body>
    </html>
  );
}

export const emailStyles = styles;
