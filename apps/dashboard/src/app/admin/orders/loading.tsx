export default function LoadingOrders() {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="bg-muted h-7 w-40 animate-pulse rounded" />
        <div className="bg-muted h-9 w-32 animate-pulse rounded" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-muted/60 h-14 w-full animate-pulse rounded border" />
        ))}
      </div>
    </main>
  );
}
