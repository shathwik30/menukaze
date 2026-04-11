import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Menukaze Kiosk',
  description: 'Self-serve ordering kiosk',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen overflow-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
