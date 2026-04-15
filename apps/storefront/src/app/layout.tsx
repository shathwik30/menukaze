import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { CookieConsent } from './_components/cookie-consent';
import '@/env';
import './globals.css';

export const metadata: Metadata = {
  title: 'Menukaze',
  description: 'Restaurant storefront',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce is injected by middleware (x-nonce header) for CSP enforcement.
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html lang="en">
      {/* Passing nonce on <head> makes Next.js apply it to its own inline scripts. */}
      <head nonce={nonce} />
      <body className="bg-background text-foreground min-h-screen antialiased">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
