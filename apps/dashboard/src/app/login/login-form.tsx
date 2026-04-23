'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuroraBackdrop, BrandRow, Button, Eyebrow, FieldError, Input, Label } from '@menukaze/ui';
import { authClient } from '@/lib/auth-client';

export function LoginForm({ inviteToken }: { inviteToken: string }) {
  const router = useRouter();
  const signupHref = inviteToken ? `/signup?invite=${encodeURIComponent(inviteToken)}` : '/signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message ?? 'Login failed.');
      setBusy(false);
      return;
    }
    router.push(inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : '/admin');
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen overflow-hidden">
      <AuroraBackdrop intensity="soft" />

      <div className="relative z-10 grid w-full grid-cols-1 lg:grid-cols-2">
        <aside className="bg-ink-950 text-canvas-50 relative hidden flex-col justify-between p-10 lg:flex">
          <div className="flex items-center justify-between">
            <BrandRow size="md" className="text-canvas-50" />
            <Link
              href="https://menukaze.com"
              className="text-ink-400 hover:text-canvas-50 text-[12px] tracking-[0.18em] uppercase transition-colors"
            >
              ← Back to site
            </Link>
          </div>

          <figure className="space-y-8">
            <blockquote className="text-canvas-50 font-serif text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-medium tracking-tight">
              &ldquo;Menukaze replaced three vendors for us &mdash; QR menus, online orders, and the
              kitchen screen. The design alone sets a new bar.&rdquo;
            </blockquote>
            <figcaption className="flex items-center gap-4">
              <div className="bg-saffron-500/20 ring-saffron-400/40 size-10 rounded-full ring-1" />
              <div>
                <p className="text-canvas-50 font-medium">Aruna Shivan</p>
                <p className="text-ink-400 text-sm">Owner, Tamarind Kitchen</p>
              </div>
            </figcaption>
          </figure>

          <div className="text-ink-500 flex items-center gap-5 text-[11px] tracking-[0.18em] uppercase">
            <span>PCI-DSS</span>
            <span className="bg-ink-700 size-1 rounded-full" />
            <span>SOC 2 Type II</span>
            <span className="bg-ink-700 size-1 rounded-full" />
            <span>GDPR Ready</span>
          </div>
        </aside>

        <section className="relative flex min-h-screen items-center justify-center px-6 py-14 sm:px-12">
          <div className="w-full max-w-sm">
            <div className="mb-10 flex items-center justify-between lg:hidden">
              <BrandRow size="sm" />
            </div>

            <Eyebrow withBar tone="accent">
              Owner &amp; staff login
            </Eyebrow>
            <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight font-medium tracking-tight sm:text-5xl">
              Welcome back.
            </h1>
            <p className="text-ink-500 dark:text-ink-400 mt-2 text-sm">
              {inviteToken
                ? 'Sign in with the email that received the invite to accept your staff role.'
                : 'Log in to run your restaurant with Menukaze.'}
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email" required>
                  Email
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@restaurant.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password" required>
                  Password
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error ? <FieldError>{error}</FieldError> : null}

              <Button type="submit" size="lg" full loading={busy} disabled={busy}>
                {busy ? 'Signing in' : 'Sign in'}
              </Button>
            </form>

            <p className="text-ink-500 dark:text-ink-400 mt-6 text-center text-sm">
              {inviteToken ? 'First time on Menukaze?' : 'New to Menukaze?'}{' '}
              <Link
                href={signupHref}
                className="text-saffron-700 dark:text-saffron-400 font-medium underline-offset-4 hover:underline"
              >
                {inviteToken ? 'Create staff account' : 'Create owner account'}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
