import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Fraunces, JetBrains_Mono } from 'next/font/google';
import { PinOverlay } from '@/components/pin-overlay';
import '@/env';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  style: ['normal', 'italic'],
  axes: ['SOFT', 'opsz'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Menukaze Kiosk',
  description: 'Self-serve ordering kiosk',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}>
      <body
        className="bg-background text-foreground h-screen w-screen select-none overflow-hidden font-sans antialiased"
        style={{ touchAction: 'manipulation' }}
      >
        {children}
        <PinOverlay />
      </body>
    </html>
  );
}
