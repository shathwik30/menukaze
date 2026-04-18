'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, BrandRow, Badge, cn } from '@menukaze/ui';
import { signOutAction } from '@/app/actions/auth';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const baseIconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.75',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/health',
    label: 'Health',
    icon: (
      <svg {...baseIconProps}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    href: '/merchants',
    label: 'Merchants',
    icon: (
      <svg {...baseIconProps}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/plans',
    label: 'Plans',
    icon: (
      <svg {...baseIconProps}>
        <path d="M19 14v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3" />
        <path d="m12 2 8 8h-5v8h-6v-8H4Z" />
      </svg>
    ),
  },
  {
    href: '/flags',
    label: 'Feature flags',
    icon: (
      <svg {...baseIconProps}>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
      </svg>
    ),
  },
  {
    href: '/onboarding',
    label: 'Onboarding',
    icon: (
      <svg {...baseIconProps}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  {
    href: '/invoices',
    label: 'Invoices',
    icon: (
      <svg {...baseIconProps}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    href: '/audit',
    label: 'Audit log',
    icon: (
      <svg {...baseIconProps}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
];

interface SidebarProps {
  email: string;
  name: string;
}

export function Sidebar({ email, name }: SidebarProps) {
  const pathname = usePathname() ?? '';

  return (
    <aside className="border-ink-100 bg-surface dark:border-ink-900 dark:bg-ink-900 sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r">
      <div className="border-ink-100 dark:border-ink-800 border-b px-5 py-5">
        <div className="flex items-center justify-between">
          <BrandRow size="sm" />
          <Badge variant="outline" size="xs" shape="pill">
            Console
          </Badge>
        </div>
        <p className="text-ink-500 dark:text-ink-400 mt-2 text-[11px] font-semibold tracking-[0.18em] uppercase">
          Platform super admin
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-all duration-150 [&_svg]:size-[1.05em] [&_svg]:shrink-0',
                    active
                      ? 'bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950 shadow-sm'
                      : 'text-ink-600 hover:bg-canvas-100 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-canvas-50',
                  )}
                >
                  <span
                    className={cn(
                      active
                        ? 'text-saffron-400 dark:text-saffron-600'
                        : 'text-ink-400 dark:text-ink-500',
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-ink-100 dark:border-ink-800 shrink-0 border-t p-4">
        <div className="flex items-center gap-3">
          <Avatar fallback={name || email} size="sm" tone="saffron" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{name}</p>
            <p className="text-ink-500 dark:text-ink-400 truncate text-[11px]">{email}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-ink-500 hover:bg-canvas-100 hover:text-ink-950 dark:hover:bg-ink-800 dark:hover:text-canvas-50 rounded-md p-1.5 transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
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
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
