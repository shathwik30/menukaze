import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import '@/env';
import './globals.css';

export const metadata: Metadata = {
  title: 'Menukaze QR Dine-In',
  description: 'Scan to order at your table',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html lang="en">
      <head nonce={nonce} />
      <body className="bg-background text-foreground min-h-screen antialiased">{children}</body>
    </html>
  );
}
