'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInviteAction } from '@/app/actions/staff';

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await acceptInviteAction(token);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push('/admin');
        });
      }}
      className="mt-4 flex flex-col gap-3"
    >
      <button
        type="submit"
        disabled={isPending}
        className="bg-primary text-primary-foreground h-10 rounded-md px-4 text-sm font-medium disabled:opacity-50"
      >
        {isPending ? 'Joining…' : 'Accept invite'}
      </button>
      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}
    </form>
  );
}
