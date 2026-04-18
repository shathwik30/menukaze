'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AuroraBackdrop,
  BrandRow,
  Button,
  Eyebrow,
  FieldError,
  FieldHint,
  Input,
  Label,
} from '@menukaze/ui';
import { authClient } from '@/lib/auth-client';

export function SignupForm({ inviteToken }: { inviteToken: string }) {
  const router = useRouter();
  const loginHref = inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : '/login';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await authClient.signUp.email({ name, email, password });
    if (result.error) {
      setError(result.error.message ?? 'Sign-up failed.');
      setBusy(false);
      return;
    }
    router.push(inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : '/onboarding');
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen overflow-hidden">
      <AuroraBackdrop intensity="soft" />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col justify-center px-6 py-14 sm:px-10">
        <div className="mb-10">
          <BrandRow size="md" />
        </div>

        <Eyebrow withBar tone="accent">
          {inviteToken ? 'Staff invite' : 'Create an account'}
        </Eyebrow>
        <h1 className="text-foreground mt-3 font-serif text-4xl leading-tight font-medium tracking-tight sm:text-[2.75rem]">
          {inviteToken ? 'Join your team.' : 'Open your restaurant.'}
        </h1>
        <p className="text-ink-500 dark:text-ink-400 mt-2 text-sm">
          {inviteToken
            ? 'Use the email address that received the invite so we can match you to your restaurant.'
            : 'Menukaze is built for restaurants that take their presentation seriously. Create an owner account to get started.'}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="su-name" required>
              Your name
            </Label>
            <Input
              id="su-name"
              type="text"
              required
              minLength={1}
              maxLength={120}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="su-email" required>
              Work email
            </Label>
            <Input
              id="su-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@restaurant.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="su-pwd" required>
              Password
            </Label>
            <Input
              id="su-pwd"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
            />
            <FieldHint>Use 8+ characters with a mix of letters and numbers.</FieldHint>
          </div>

          {error ? <FieldError>{error}</FieldError> : null}

          <Button type="submit" size="lg" full loading={busy} disabled={busy}>
            {busy ? 'Creating account' : 'Create account'}
          </Button>

          <p className="text-ink-500 dark:text-ink-400 text-[11px] leading-relaxed">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="underline underline-offset-4">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline underline-offset-4">
              Privacy Policy
            </Link>
            .
          </p>
        </form>

        <p className="text-ink-500 dark:text-ink-400 mt-6 text-center text-sm">
          Already have an account?{' '}
          <Link
            href={loginHref}
            className="text-saffron-700 dark:text-saffron-400 font-medium underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
