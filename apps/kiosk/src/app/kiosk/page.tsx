import { headers } from 'next/headers';

export default async function KioskScreen() {
  const h = await headers();
  const slug = h.get('x-tenant-slug');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-12 text-center">
      <h1 className="text-6xl font-extrabold tracking-tight">Tap to Start</h1>
      <p className="text-muted-foreground text-2xl">
        Welcome to{' '}
        <span className="text-foreground font-mono font-semibold">{slug ?? 'Menukaze'}</span>
      </p>
      <p className="text-muted-foreground text-base">
        Kiosk ordering will include PIN-locked exit, dining mode selection, full menu browsing, and
        token numbers.
      </p>
    </main>
  );
}
