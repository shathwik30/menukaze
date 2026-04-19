export default function AdminExitPage() {
  return (
    <main className="kiosk-screen flex flex-col items-center justify-center gap-5 bg-zinc-950 text-white">
      <p className="text-sm font-black tracking-[0.28em] text-emerald-300 uppercase">Staff mode</p>
      <h1 className="text-6xl font-black">Kiosk mode ended</h1>
      <p className="text-2xl text-white/60">You can now close this tab or navigate away.</p>
    </main>
  );
}
