'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuroraBackdrop, BrandRow, Button, Eyebrow, FieldError, Input, Label } from '@menukaze/ui';
import { authClient } from '@/lib/auth-client';

export function LoginForm() {
  const router = useRouter();
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

    router.push('/');
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <AuroraBackdrop intensity="soft" />
      <div className="relative z-10 w-full max-w-sm px-6">
        <div className="mb-10 flex items-center justify-between">
          <BrandRow size="sm" />
          <span className="border-ink-200 bg-canvas-50 text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
            Restricted
          </span>
        </div>

        <Eyebrow withBar tone="accent">
          Platform console
        </Eyebrow>
        <h1 className="text-foreground mt-3 font-serif text-4xl font-medium leading-tight tracking-tight">
          Super admin sign&#8209;in.
        </h1>
        <p className="text-ink-500 dark:text-ink-400 mt-2 text-sm">
          Access to the Menukaze operator console is limited to approved platform staff.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sa-email" required>
              Email
            </Label>
            <Input
              id="sa-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@menukaze.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sa-pwd" required>
              Password
            </Label>
            <Input
              id="sa-pwd"
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

        <p className="text-ink-400 dark:text-ink-500 mt-6 text-center text-[11px] uppercase tracking-[0.14em]">
          Monitored · All actions logged
        </p>
      </div>
    </main>
  );
}
