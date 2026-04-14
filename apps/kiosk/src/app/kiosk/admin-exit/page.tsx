export default function AdminExitPage() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-white">
      <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Staff mode</p>
      <h1 className="text-5xl font-black">Kiosk mode ended</h1>
      <p className="text-xl text-white/60">You can now close this tab or navigate away.</p>
    </main>
  );
}
