import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PinOverlay } from '@/components/pin-overlay';
import './globals.css';

export const metadata: Metadata = {
  title: 'Menukaze Kiosk',
  description: 'Self-serve ordering kiosk',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/*
       * overflow-hidden prevents pull-to-refresh and rubber-band scrolling on
       * iOS / Android kiosk tablets. touch-manipulation removes the 300 ms tap
       * delay on touch screens.
       */}
      <body
        className="bg-background text-foreground h-screen w-screen select-none overflow-hidden antialiased"
        style={{ touchAction: 'manipulation' }}
      >
        {children}
        <PinOverlay />
      </body>
    </html>
  );
}
