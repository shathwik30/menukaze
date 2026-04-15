export default function LoadingOrder() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8">
      <div className="bg-muted h-6 w-32 animate-pulse rounded" />
      <div className="bg-muted h-8 w-64 animate-pulse rounded" />
      <div className="bg-muted/60 h-40 w-full animate-pulse rounded border" />
      <div className="bg-muted/60 h-24 w-full animate-pulse rounded border" />
    </main>
  );
}
