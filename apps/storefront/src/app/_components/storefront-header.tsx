import { Badge, Eyebrow, MeshBackdrop } from '@menukaze/ui';

interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
}

interface Props {
  name: string;
  description?: string;
  logoUrl?: string;
  address: Address;
  isOpen: boolean;
  statusLabel: string;
  todayHours: string;
  phone?: string;
}

/**
 * Editorial hero for the storefront. Large display serif lockup, warm mesh
 * backdrop, status pill with animated dot, today's hours and phone.
 * Server component — no client JS.
 */
export function StorefrontHeader({
  name,
  description,
  logoUrl,
  address,
  isOpen,
  statusLabel,
  todayHours,
  phone,
}: Props) {
  const addressLine = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <header className="border-ink-100 bg-canvas-50 dark:border-ink-900 dark:bg-ink-950 relative overflow-hidden border-b">
      <MeshBackdrop />
      <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24 lg:px-8">
        <Eyebrow withBar tone="accent">
          Now ordering
        </Eyebrow>

        <div className="mt-6 flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-5">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${name} logo`}
                  className="ring-ink-200 dark:ring-ink-800 size-16 shrink-0 rounded-2xl object-cover shadow-md ring-1"
                />
              ) : (
                <div
                  aria-hidden
                  className="bg-ink-950 text-canvas-50 dark:bg-canvas-50 dark:text-ink-950 flex size-16 shrink-0 items-center justify-center rounded-2xl font-serif text-2xl font-medium shadow-md ring-1 ring-black/10"
                >
                  {name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-foreground font-serif text-4xl font-medium leading-[0.95] tracking-tight sm:text-5xl md:text-6xl">
                  {name}
                </h1>
              </div>
            </div>
            {description ? (
              <p className="text-ink-600 dark:text-ink-300 mt-5 max-w-xl text-[15px] leading-relaxed">
                {description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge
              variant={isOpen ? 'success' : 'subtle'}
              size="md"
              shape="pill"
              dot
              dotColor={isOpen ? 'oklch(0.590 0.140 172)' : 'oklch(0.54 0.010 82)'}
            >
              {statusLabel}
            </Badge>
            <span className="mk-nums text-ink-500 dark:text-ink-400 text-[13px]">
              Today · {todayHours}
            </span>
          </div>
        </div>

        <div className="border-ink-100 text-ink-500 dark:border-ink-800 dark:text-ink-400 mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-5 text-[13px]">
          <span className="inline-flex items-center gap-2">
            <PinIcon className="text-ink-400 size-3.5" />
            {addressLine}
          </span>
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="text-ink-700 hover:text-saffron-700 dark:text-canvas-100 dark:hover:text-saffron-300 inline-flex items-center gap-2 transition-colors"
            >
              <PhoneIcon className="size-3.5" />
              {phone}
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
