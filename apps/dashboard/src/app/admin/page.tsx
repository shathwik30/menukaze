import { headers } from 'next/headers';

export default async function DashboardAdminPage() {
  const h = await headers();
  const slug = h.get('x-tenant-slug');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">Menukaze Dashboard</h1>
      <p className="text-muted-foreground text-xl">
        {slug ? (
          <>
            Operating: <span className="text-foreground font-mono font-semibold">{slug}</span>{' '}
            (admin)
          </>
        ) : (
          'No tenant resolved'
        )}
      </p>
    </main>
  );
}
