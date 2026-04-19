'use client';

import { useRouter } from 'next/navigation';
import { Button, Eyebrow } from '@menukaze/ui';
import { useKioskCart } from '@/stores/cart';
import { useIdleReset } from '@/hooks/use-idle-reset';

export default function ModeSelectPage() {
  const router = useRouter();
  const setOrderMode = useKioskCart((s) => s.setOrderMode);
  useIdleReset();

  function choose(mode: 'dine_in' | 'takeaway') {
    setOrderMode(mode);
    router.push('/kiosk/menu');
  }

  return (
    <main className="bg-canvas-50 text-ink-950 flex h-screen flex-col">
      <header className="border-ink-100 bg-surface flex h-24 shrink-0 items-center justify-between border-b px-10">
        <Button
          type="button"
          onClick={() => router.push('/kiosk')}
          variant="outline"
          size="2xl"
          className="text-ink-700 active:bg-canvas-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </Button>
        <div className="text-center">
          <Eyebrow tone="accent">Step 1 of 3</Eyebrow>
          <h1 className="text-ink-950 mt-2 font-serif text-4xl font-medium tracking-tight">
            How are you dining today?
          </h1>
        </div>
        <div className="w-32" />
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-2 gap-8 p-10">
        <ModeTile
          tone="jade"
          icon={<DineInIcon />}
          label="Dine in"
          description="Eat here and listen for your pickup number."
          cta="Choose dine in"
          onClick={() => choose('dine_in')}
        />
        <ModeTile
          tone="saffron"
          icon={<TakeawayIcon />}
          label="Takeaway"
          description="Collect your order when your number is called."
          cta="Choose takeaway"
          onClick={() => choose('takeaway')}
        />
      </section>
    </main>
  );
}

function ModeTile({
  tone,
  icon,
  label,
  description,
  cta,
  onClick,
}: {
  tone: 'jade' | 'saffron';
  icon: React.ReactNode;
  label: string;
  description: string;
  cta: string;
  onClick: () => void;
}) {
  const accent =
    tone === 'jade'
      ? 'bg-jade-100 text-jade-800 ring-jade-200'
      : 'bg-saffron-100 text-saffron-900 ring-saffron-200';
  const ctaBg = tone === 'jade' ? 'group-active:bg-jade-600' : 'group-active:bg-saffron-600';
  const activeBorder = tone === 'jade' ? 'active:border-jade-500' : 'active:border-saffron-500';

  return (
    <Button
      type="button"
      onClick={onClick}
      variant="plain"
      size="none"
      className={`border-ink-100 bg-surface group flex min-h-0 flex-col justify-between rounded-3xl border-2 p-10 text-left shadow-sm transition-all duration-200 hover:shadow-xl active:scale-[0.99] ${activeBorder}`}
    >
      <span
        className={`inline-flex size-20 items-center justify-center rounded-2xl ring-1 ring-inset [&_svg]:size-10 ${accent}`}
      >
        {icon}
      </span>
      <span>
        <span className="text-ink-950 block font-serif text-[5.5rem] leading-[0.9] font-medium tracking-tight">
          {label}
        </span>
        <span className="text-ink-500 mt-5 block max-w-md text-2xl leading-snug">
          {description}
        </span>
      </span>
      <span
        className={`bg-ink-950 text-canvas-50 inline-flex h-20 items-center justify-between rounded-2xl px-8 text-2xl font-medium shadow-lg transition-colors ${ctaBg}`}
      >
        {cta}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-7 transition-transform duration-300 group-hover:translate-x-1"
          aria-hidden
        >
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </span>
    </Button>
  );
}

function DineInIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 3v18M3 7.5a4.5 4.5 0 0 1 9 0V21M3 7.5V21" />
      <path d="M21 10h-4" />
    </svg>
  );
}
function TakeawayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 9h16l-1.5 10a2 2 0 0 1-2 1.7H7.5A2 2 0 0 1 5.5 19Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </svg>
  );
}
