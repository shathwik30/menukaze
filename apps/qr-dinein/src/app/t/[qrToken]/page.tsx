import { headers } from 'next/headers';

interface Props {
  params: Promise<{ qrToken: string }>;
}

export default async function TableLanding({ params }: Props) {
  const { qrToken } = await params;
  const h = await headers();
  const slug = h.get('x-tenant-slug');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Table Session</h1>
      <p className="text-muted-foreground text-base">
        Restaurant:{' '}
        <span className="text-foreground font-mono font-semibold">{slug ?? 'unknown'}</span>
      </p>
      <p className="text-muted-foreground text-base">
        QR Token: <span className="text-foreground font-mono font-semibold">{qrToken}</span>
      </p>
      <p className="text-muted-foreground text-sm">
        Phase 4 will add: name/email/phone form, geofence verification, menu, multi-round ordering.
      </p>
    </main>
  );
}
