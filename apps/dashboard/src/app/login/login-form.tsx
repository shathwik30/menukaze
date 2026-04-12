'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-3xl font-bold">Log in</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          {inviteToken
            ? 'Log in with the email that received the staff invite.'
            : 'Welcome back to Menukaze.'}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
          </label>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          {inviteToken ? 'Need an account for this invite?' : 'Opening a restaurant?'}{' '}
          <Link href={signupHref} className="text-foreground font-medium hover:underline">
            {inviteToken ? 'Create staff account' : 'Create owner account'}
          </Link>
        </p>
      </div>
    </main>
  );
}
