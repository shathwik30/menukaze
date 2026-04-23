import Link from 'next/link';
import { AuroraBackdrop, BrandRow, Button, Eyebrow } from '@menukaze/ui';

export const dynamic = 'force-static';

export default function EmailVerifiedPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <AuroraBackdrop intensity="soft" />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-start px-6 py-14 sm:px-10">
        <div className="mb-10">
          <BrandRow size="md" />
        </div>
        <Eyebrow withBar tone="success">
          Email confirmed
        </Eyebrow>
        <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight font-medium tracking-tight">
          You&apos;re all set.
        </h1>
        <p className="text-ink-500 dark:text-ink-400 mt-3 text-sm">
          Your email has been verified. You can now sign in and start running your restaurant on
          Menukaze.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login">
            <Button size="lg" variant="primary">
              Go to sign in
            </Button>
          </Link>
          <Link href="/">
            <Button size="lg" variant="outline">
              Back to home
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
