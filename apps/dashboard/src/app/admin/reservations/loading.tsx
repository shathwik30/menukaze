export default function LoadingReservations() {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="bg-muted h-7 w-48 animate-pulse rounded" />
        <div className="bg-muted h-9 w-36 animate-pulse rounded" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="bg-muted h-5 w-28 animate-pulse rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`upcoming-${i}`}
              className="bg-muted/60 h-16 w-full animate-pulse rounded border"
            />
          ))}
        </div>
        <div className="space-y-2">
          <div className="bg-muted h-5 w-20 animate-pulse rounded" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`past-${i}`}
              className="bg-muted/60 h-16 w-full animate-pulse rounded border"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
