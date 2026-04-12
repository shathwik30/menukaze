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
 * Hero / header for the default storefront. Server component, no client JS.
 * Shows the restaurant name, logo, current open/closed state, today's hours,
 * and the address line as a compact block.
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
    <header className="border-border bg-background border-b">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-6">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            // Inline img keeps this a server component without next/image setup
            <img
              src={logoUrl}
              alt={`${name} logo`}
              className="h-14 w-14 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-lg font-semibold">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold sm:text-3xl">{name}</h1>
            {description ? (
              <p className="text-muted-foreground mt-1 max-w-prose text-sm">{description}</p>
            ) : null}
            <p className="text-muted-foreground mt-1 truncate text-sm">{addressLine}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className={
                isOpen
                  ? 'inline-block h-2 w-2 rounded-full bg-emerald-500'
                  : 'bg-muted-foreground inline-block h-2 w-2 rounded-full'
              }
            />
            <span className={isOpen ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              {statusLabel}
            </span>
          </span>
          <span className="text-muted-foreground">Today: {todayHours}</span>
          {phone ? (
            <a href={`tel:${phone}`} className="text-foreground underline">
              {phone}
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
