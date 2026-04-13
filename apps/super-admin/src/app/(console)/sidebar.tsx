'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from '@/app/actions/auth';
import { cn } from '@menukaze/ui';

const NAV_ITEMS = [
  { href: '/health', label: 'Health' },
  { href: '/merchants', label: 'Merchants' },
  { href: '/plans', label: 'Plans' },
  { href: '/flags', label: 'Feature Flags' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/audit', label: 'Audit Log' },
] as const;

interface SidebarProps {
  email: string;
  name: string;
}

export function Sidebar({ email, name }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="border-border bg-card flex w-60 shrink-0 flex-col border-r">
      <div className="border-border border-b px-4 py-5">
        <h2 className="text-sm font-semibold tracking-tight">Menukaze</h2>
        <p className="text-muted-foreground text-xs">Super Admin</p>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-border border-t px-4 py-4">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-muted-foreground truncate text-xs">{email}</p>
        <form action={signOutAction} className="mt-3">
          <button
            type="submit"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
