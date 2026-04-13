import type { ReactNode } from 'react';
import { requireSuperAdmin } from '@/lib/session';
import { Sidebar } from './sidebar';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requireSuperAdmin();

  return (
    <div className="flex min-h-screen">
      <Sidebar email={session.user.email} name={session.user.name} />
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
