'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Avatar, BrandRow, cn } from '@menukaze/ui';

export interface NavGroup {
  label: string;
  items: Array<{
    href: string;
    label: string;
    visible: boolean;
    icon: ReactNode;
    badge?: string;
  }>;
}

interface AdminShellProps {
  children: ReactNode;
  restaurantName: string;
  restaurantSlug: string;
  userEmail: string;
  userName?: string;
  groups: NavGroup[];
  signOutAction: () => void | Promise<void>;
}

export function AdminShell({
  children,
  restaurantName,
  restaurantSlug,
  userEmail,
  userName,
  groups,
  signOutAction,
}: AdminShellProps) {
  const pathname = usePathname() ?? '';
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="bg-canvas-100 text-foreground dark:bg-ink-950 flex min-h-screen">
      {/* Mobile top bar */}
      <div className="border-ink-100 bg-surface/80 dark:border-ink-900 dark:bg-ink-900/80 fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="border-ink-200 text-ink-700 hover:bg-canvas-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800 inline-flex size-9 items-center justify-center rounded-lg border"
          aria-label="Open navigation"
        >
          <MenuIcon />
        </button>
        <BrandRow size="sm" />
        <div className="w-9" />
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          'border-ink-100 bg-surface dark:border-ink-900 dark:bg-ink-900 fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
        )}
        aria-label="Primary"
      >
        <div className="border-ink-100 dark:border-ink-800 flex h-16 shrink-0 items-center justify-between border-b px-5">
          <BrandRow size="sm" />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="text-ink-500 hover:bg-canvas-100 dark:hover:bg-ink-800 rounded-md p-1 lg:hidden"
            aria-label="Close navigation"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="border-ink-100 dark:border-ink-800 border-b px-5 py-4">
          <p className="text-ink-500 dark:text-ink-400 text-[11px] font-semibold uppercase tracking-[0.14em]">
            Workspace
          </p>
          <p className="text-foreground mt-1 truncate font-serif text-lg font-medium leading-tight tracking-tight">
            {restaurantName}
          </p>
          <p className="text-ink-400 dark:text-ink-500 mt-0.5 truncate font-mono text-[11px]">
            {restaurantSlug}.menukaze.com
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => {
            const visibleItems = group.items.filter((i) => i.visible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label} className="mb-6">
                <p className="text-ink-400 dark:text-ink-500 mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em]">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const active =
                      pathname === item.href ||
                      (item.href !== '/admin' && pathname.startsWith(item.href + '/')) ||
                      (item.href !== '/admin' && pathname === item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            'relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-all duration-150 [&_svg]:size-[1.05em] [&_svg]:shrink-0',
                            active
                              ? 'bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950 shadow-sm'
                              : 'text-ink-600 hover:bg-canvas-100 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-canvas-50',
                          )}
                        >
                          <span
                            className={cn(
                              active
                                ? 'text-saffron-400 dark:text-saffron-500'
                                : 'text-ink-400 dark:text-ink-500',
                            )}
                          >
                            {item.icon}
                          </span>
                          <span className="flex-1">{item.label}</span>
                          {item.badge ? (
                            <span className="bg-saffron-500/15 text-saffron-800 dark:text-saffron-300 rounded-full px-1.5 text-[10px] font-semibold">
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-ink-100 dark:border-ink-800 shrink-0 border-t p-4">
          <div className="flex items-center gap-3">
            <Avatar fallback={userName ?? userEmail} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-[13px] font-medium">
                {userName ?? userEmail.split('@')[0]}
              </p>
              <p className="text-ink-500 dark:text-ink-400 truncate text-[11px]">{userEmail}</p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-ink-500 hover:bg-canvas-100 hover:text-ink-950 dark:hover:bg-ink-800 dark:hover:text-canvas-50 rounded-md p-1.5 transition-colors"
                aria-label="Sign out"
                title="Sign out"
              >
                <SignOutIcon />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {mobileOpen ? (
        <button
          type="button"
          className="bg-ink-950/40 fixed inset-0 z-30 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* Main content */}
      <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className="size-5"
      aria-hidden
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className="size-5"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}
