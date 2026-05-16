'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
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

type SearchResultType = 'page' | 'order' | 'customer' | 'menu' | 'table' | 'reservation' | 'staff';

interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  href: string;
}

interface SearchSection {
  label: string;
  results: SearchResult[];
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
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSections, setSearchSections] = useState<SearchSection[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const environmentRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const visiblePages = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items
          .filter((item) => item.visible)
          .map((item) => ({
            id: item.href,
            type: 'page' as const,
            title: item.label,
            subtitle: group.label,
            href: item.href,
          })),
      ),
    [groups],
  );

  const pageSection = useMemo<SearchSection | null>(() => {
    const query = searchQuery.trim().toLowerCase();
    const results = query
      ? visiblePages.filter(
          (page) =>
            page.title.toLowerCase().includes(query) ||
            page.subtitle.toLowerCase().includes(query) ||
            page.href.toLowerCase().includes(query),
        )
      : visiblePages.slice(0, 8);

    return results.length > 0 ? { label: query ? 'Pages' : 'Quick links', results } : null;
  }, [searchQuery, visiblePages]);

  const combinedSearchSections = useMemo(
    () =>
      [pageSection, ...searchSections].filter((section): section is SearchSection =>
        Boolean(section),
      ),
    [pageSection, searchSections],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setWorkspaceOpen(false);
    setEnvironmentOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (workspaceRef.current && !workspaceRef.current.contains(target)) {
        setWorkspaceOpen(false);
      }
      if (environmentRef.current && !environmentRef.current.contains(target)) {
        setEnvironmentOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;

    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchSections([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      fetch(`/api/admin/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('Search failed.');
          return (await response.json()) as { sections: SearchSection[] };
        })
        .then((payload) => setSearchSections(payload.sections))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setSearchSections([]);
          setSearchError('Search is unavailable right now.');
        })
        .finally(() => setSearchLoading(false));
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchOpen, searchQuery]);

  const openSearch = () => {
    setSearchOpen(true);
    setMobileOpen(false);
  };

  const toggleNavigation = () => {
    setWorkspaceOpen(false);
    setEnvironmentOpen(false);
    setNotificationsOpen(false);
    setDesktopSidebarOpen((open) => !open);
    setMobileOpen((open) => !open);
  };

  const settingsVisible = visiblePages.some((page) => page.href === '/admin/settings');

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--mk-canvas-100)' }}>
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col transition-transform duration-300',
          desktopSidebarOpen ? 'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0' : 'lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          width: 256,
          background: 'white',
          borderRight: '1px solid var(--mk-ink-100)',
        }}
        aria-label="Primary"
      >
        {/* Brand */}
        <div
          style={{
            height: 60,
            padding: '0 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--mk-ink-100)',
            flexShrink: 0,
          }}
        >
          <BrandRow size="sm" />
          <button
            title="Search"
            type="button"
            onClick={openSearch}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 7,
              color: 'var(--mk-ink-500)',
              border: '1px solid var(--mk-ink-100)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <SearchIcon size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              setDesktopSidebarOpen(false);
            }}
            style={{
              color: 'var(--mk-ink-500)',
              background: 'transparent',
              cursor: 'pointer',
              padding: 4,
            }}
            aria-label="Close navigation"
            title="Close navigation"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Workspace */}
        <div
          ref={workspaceRef}
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--mk-ink-100)',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--mk-ink-400)',
            }}
          >
            Workspace
          </div>
          <button
            type="button"
            onClick={() => {
              setWorkspaceOpen((open) => !open);
              setEnvironmentOpen(false);
              setNotificationsOpen(false);
            }}
            aria-expanded={workspaceOpen}
            style={{
              width: '100%',
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: 0,
              textAlign: 'left',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 16,
                  fontWeight: 500,
                  letterSpacing: '-0.015em',
                  color: 'var(--mk-ink-950)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {restaurantName}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--mk-ink-400)',
                  letterSpacing: '-0.005em',
                  marginTop: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {restaurantSlug}.menukaze.com
              </div>
            </div>
            <ChevronDownIcon />
          </button>
          {workspaceOpen ? (
            <div
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                top: 'calc(100% - 8px)',
                zIndex: 70,
                borderRadius: 12,
                border: '1px solid var(--mk-ink-100)',
                background: 'white',
                boxShadow: 'var(--shadow-xl)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: 14, borderBottom: '1px solid var(--mk-ink-100)' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--mk-ink-950)' }}>
                  {restaurantName}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--mk-ink-500)',
                  }}
                >
                  {restaurantSlug}.menukaze.com
                </div>
              </div>
              <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Link href="/admin" style={menuLinkStyle()}>
                  Dashboard
                </Link>
                {settingsVisible ? (
                  <Link href="/admin/settings" style={menuLinkStyle()}>
                    Workspace settings
                  </Link>
                ) : null}
                <a
                  href={`https://${restaurantSlug}.menukaze.com`}
                  target="_blank"
                  rel="noreferrer"
                  style={menuLinkStyle()}
                >
                  Open storefront
                </a>
              </div>
            </div>
          ) : null}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
          {groups.map((group) => {
            const visibleItems = group.items.filter((i) => i.visible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label} style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'var(--mk-ink-400)',
                    padding: '0 12px',
                    marginBottom: 6,
                  }}
                >
                  {group.label}
                </div>
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                  }}
                >
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
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '7px 12px',
                            borderRadius: 8,
                            fontSize: 13.5,
                            fontWeight: 500,
                            textDecoration: 'none',
                            background: active ? 'var(--mk-ink-950)' : 'transparent',
                            color: active ? 'var(--mk-canvas-50)' : 'var(--mk-ink-700)',
                            transition: 'background 150ms, color 150ms',
                          }}
                          onMouseEnter={(e) => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background =
                                'var(--mk-canvas-200)';
                              (e.currentTarget as HTMLElement).style.color = 'var(--mk-ink-950)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!active) {
                              (e.currentTarget as HTMLElement).style.background = 'transparent';
                              (e.currentTarget as HTMLElement).style.color = 'var(--mk-ink-700)';
                            }
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              width: 16,
                              height: 16,
                              color: active ? 'var(--mk-saffron-400)' : 'var(--mk-ink-400)',
                              flexShrink: 0,
                            }}
                          >
                            {item.icon}
                          </span>
                          <span style={{ flex: 1 }}>{item.label}</span>
                          {item.badge ? (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                background: active
                                  ? 'rgba(255,255,255,0.10)'
                                  : 'var(--mk-saffron-50)',
                                color: active ? 'var(--mk-canvas-50)' : 'var(--mk-saffron-800)',
                                padding: '1px 7px',
                                borderRadius: 999,
                              }}
                            >
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

        {/* User */}
        <div style={{ borderTop: '1px solid var(--mk-ink-100)', padding: 12, flexShrink: 0 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 10 }}
          >
            <Avatar fallback={userName ?? userEmail} size="sm" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: 'var(--mk-ink-950)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {userName ?? userEmail.split('@')[0]}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--mk-ink-500)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {userEmail}
              </div>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out"
                style={{
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  color: 'var(--mk-ink-400)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <SignOutIcon />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 lg:hidden"
          style={{
            background: 'oklch(0.14 0.016 90 / 0.4)',
            backdropFilter: 'blur(4px)',
            border: 'none',
            cursor: 'default',
          }}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* TopBar */}
        <div
          style={{
            height: 60,
            borderBottom: '1px solid var(--mk-ink-100)',
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 28px',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            flexShrink: 0,
          }}
        >
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={toggleNavigation}
            style={{
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: '1px solid var(--mk-ink-200)',
              color: 'var(--mk-ink-700)',
              background: 'white',
              cursor: 'pointer',
            }}
            aria-label="Toggle navigation"
            title="Toggle navigation"
          >
            <HamburgerIcon />
          </button>

          {/* Command palette trigger */}
          <button
            type="button"
            onClick={openSearch}
            style={{
              flex: 1,
              maxWidth: 420,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 34,
              padding: '0 12px',
              background: 'var(--mk-canvas-200)',
              border: '1px solid transparent',
              borderRadius: 9,
              color: 'var(--mk-ink-500)',
              fontSize: 13,
              cursor: 'text',
              textAlign: 'left',
            }}
          >
            <SearchIcon size={14} />
            <span style={{ flex: 1 }}>Search orders, customers, items…</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--mk-ink-500)',
                padding: '2px 6px',
                border: '1px solid var(--mk-ink-200)',
                borderRadius: 5,
                background: 'white',
                letterSpacing: '-0.02em',
              }}
            >
              ⌘K
            </span>
          </button>

          <div style={{ flex: 1 }} />

          {/* Right cluster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Environment */}
            <div ref={environmentRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  setEnvironmentOpen((open) => !open);
                  setWorkspaceOpen(false);
                  setNotificationsOpen(false);
                }}
                aria-expanded={environmentOpen}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 30,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: '1px solid var(--mk-ink-100)',
                  background: 'white',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--mk-ink-950)',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--mk-jade-500)',
                  }}
                />
                Live
                <ChevronDownIcon size={12} />
              </button>
              {environmentOpen ? (
                <div style={topbarMenuStyle(260)}>
                  <div style={{ padding: 14, borderBottom: '1px solid var(--mk-ink-100)' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--mk-ink-950)',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 99,
                          background: 'var(--mk-jade-500)',
                        }}
                      />
                      Live environment
                    </div>
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: 12,
                        lineHeight: 1.45,
                        color: 'var(--mk-ink-500)',
                      }}
                    >
                      You are viewing and changing production restaurant data.
                    </p>
                  </div>
                  <div style={{ padding: 6 }}>
                    <Link href="/admin/api-keys" style={menuLinkStyle()}>
                      Manage API keys
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Notifications */}
            <div ref={notificationsRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setWorkspaceOpen(false);
                  setEnvironmentOpen(false);
                }}
                aria-expanded={notificationsOpen}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: '1px solid var(--mk-ink-100)',
                  background: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--mk-ink-700)',
                  position: 'relative',
                  cursor: 'pointer',
                }}
                title="Notifications"
              >
                <BellIcon />
              </button>
              {notificationsOpen ? (
                <div style={topbarMenuStyle(300)}>
                  <div style={{ padding: 14, borderBottom: '1px solid var(--mk-ink-100)' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--mk-ink-950)' }}>
                      Notifications
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--mk-ink-500)' }}>
                      No unread notifications.
                    </p>
                  </div>
                  <div style={{ padding: 6 }}>
                    <Link href="/admin/orders" style={menuLinkStyle()}>
                      View live orders
                    </Link>
                    <Link href="/admin/audit" style={menuLinkStyle()}>
                      View audit log
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>

            {/* New order */}
            <Link href="/admin/orders/new" style={{ textDecoration: 'none' }}>
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 32,
                  padding: '0 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: '-0.005em',
                  borderRadius: 8,
                  whiteSpace: 'nowrap',
                  background: 'white',
                  color: 'var(--mk-ink-950)',
                  border: '1px solid var(--mk-ink-200)',
                  boxShadow: 'var(--shadow-xs)',
                  cursor: 'pointer',
                }}
              >
                <PlusIcon />
                New order
              </button>
            </Link>
          </div>
        </div>

        <div style={{ flex: 1 }}>{children}</div>
      </main>

      {searchOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search dashboard"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'oklch(0.14 0.016 90 / 0.42)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '86px 20px 20px',
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <div
            style={{
              width: 'min(720px, 100%)',
              maxHeight: 'min(680px, calc(100vh - 120px))',
              background: 'white',
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-2xl)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderBottom: '1px solid var(--mk-ink-100)',
              }}
            >
              <SearchIcon size={16} />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search orders, customers, menu items, tables…"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  fontSize: 15,
                  color: 'var(--mk-ink-950)',
                  background: 'transparent',
                }}
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                style={{
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 7,
                  color: 'var(--mk-ink-500)',
                  background: 'var(--mk-canvas-100)',
                  cursor: 'pointer',
                }}
              >
                <CloseIcon />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '10px' }}>
              {searchLoading ? (
                <div style={{ padding: '28px 18px', fontSize: 13, color: 'var(--mk-ink-500)' }}>
                  Searching…
                </div>
              ) : null}
              {searchError ? (
                <div
                  role="alert"
                  style={{
                    margin: 6,
                    padding: '10px 12px',
                    borderRadius: 9,
                    background: 'var(--mk-rose-50)',
                    color: 'var(--mk-rose-700)',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {searchError}
                </div>
              ) : null}
              {!searchLoading && combinedSearchSections.length === 0 ? (
                <div style={{ padding: '28px 18px', fontSize: 13, color: 'var(--mk-ink-500)' }}>
                  No results found.
                </div>
              ) : null}
              {combinedSearchSections.map((section) => (
                <div key={section.label} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      padding: '8px 10px 6px',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--mk-ink-400)',
                    }}
                  >
                    {section.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {section.results.map((result) => (
                      <Link
                        key={`${section.label}:${result.id}:${result.href}`}
                        href={result.href}
                        onClick={() => setSearchOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 9,
                          color: 'var(--mk-ink-950)',
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(event) => {
                          (event.currentTarget as HTMLElement).style.background =
                            'var(--mk-canvas-100)';
                        }}
                        onMouseLeave={(event) => {
                          (event.currentTarget as HTMLElement).style.background = 'transparent';
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background:
                              result.type === 'page'
                                ? 'var(--mk-ink-950)'
                                : result.type === 'order'
                                  ? 'var(--mk-saffron-50)'
                                  : result.type === 'customer'
                                    ? 'var(--mk-jade-50)'
                                    : result.type === 'table'
                                      ? 'var(--mk-lapis-50)'
                                      : 'var(--mk-canvas-200)',
                            color:
                              result.type === 'page'
                                ? 'var(--mk-saffron-300)'
                                : 'var(--mk-ink-700)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                            textTransform: 'uppercase',
                          }}
                        >
                          {result.type.slice(0, 1)}
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 13.5,
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {result.title}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              marginTop: 1,
                              fontSize: 11.5,
                              color: 'var(--mk-ink-500)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {result.subtitle || result.href}
                          </span>
                        </span>
                        <ChevronRightIcon />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function menuLinkStyle(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    minHeight: 32,
    padding: '7px 9px',
    borderRadius: 8,
    color: 'var(--mk-ink-700)',
    textDecoration: 'none',
    fontSize: 12.5,
    fontWeight: 600,
  };
}

function topbarMenuStyle(width: number): CSSProperties {
  return {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    zIndex: 80,
    width,
    borderRadius: 12,
    border: '1px solid var(--mk-ink-100)',
    background: 'white',
    boxShadow: 'var(--shadow-xl)',
    overflow: 'hidden',
  };
}

/* ─── Icon helpers ─── */

function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChevronDownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      style={{ width: size, height: size, color: 'var(--mk-ink-400)', flexShrink: 0 }}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 16, height: 16 }}
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      style={{ width: 13, height: 13 }}
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      style={{ width: 18, height: 18 }}
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
      style={{ width: 18, height: 18 }}
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
      style={{ width: 14, height: 14 }}
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      style={{ width: 14, height: 14, color: 'var(--mk-ink-400)', flexShrink: 0 }}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
