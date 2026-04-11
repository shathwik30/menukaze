export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">Restaurant not found</h1>
      <p className="text-muted-foreground">
        We couldn&apos;t find a Menukaze restaurant at this address. Double-check the URL, or
        contact the restaurant directly.
      </p>
    </main>
  );
}
