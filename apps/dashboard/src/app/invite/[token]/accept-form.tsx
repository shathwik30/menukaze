'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FieldError } from '@menukaze/ui';
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
      <Button type="submit" disabled={isPending} loading={isPending}>
        Accept invite
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
    </form>
  );
}
