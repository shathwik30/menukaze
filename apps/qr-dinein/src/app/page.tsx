import { headers } from 'next/headers';

export default async function QrDineInRoot() {
  const h = await headers();
  const slug = h.get('x-tenant-slug');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Menukaze QR Dine-In</h1>
      <p className="text-muted-foreground text-base">
        {slug ? <>Scan a table QR for {slug}</> : 'No tenant resolved'}
      </p>
    </main>
  );
}
