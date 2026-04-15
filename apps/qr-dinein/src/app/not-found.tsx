export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Session unavailable</h1>
      <p className="text-muted-foreground text-sm">
        This QR code is no longer active. Ask your server to scan a fresh code for your table.
      </p>
    </main>
  );
}
