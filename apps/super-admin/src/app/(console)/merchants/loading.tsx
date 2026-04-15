export default function LoadingMerchants() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="bg-muted h-7 w-36 animate-pulse rounded" />
        <div className="bg-muted h-5 w-20 animate-pulse rounded" />
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="bg-muted h-9 w-64 animate-pulse rounded" />
        <div className="bg-muted h-9 w-28 animate-pulse rounded" />
        <div className="bg-muted h-9 w-36 animate-pulse rounded" />
        <div className="bg-muted h-9 w-36 animate-pulse rounded" />
      </div>
      <div className="border-border overflow-hidden rounded-lg border">
        <div className="bg-muted/50 h-11 w-full animate-pulse border-b" />
        <div className="divide-border divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-muted/40 h-12 w-full animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
