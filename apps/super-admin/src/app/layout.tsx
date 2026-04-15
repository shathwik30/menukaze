import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import '@/env';
import './globals.css';

export const metadata: Metadata = {
  title: 'Menukaze Super Admin',
  description: 'Platform owner console',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>{nonce ? <meta property="csp-nonce" content={nonce} /> : null}</head>
      <body className="bg-background text-foreground min-h-screen antialiased">{children}</body>
    </html>
  );
}
