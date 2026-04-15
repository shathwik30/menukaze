'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { inviteStaffAction, revokeInviteAction } from '@/app/actions/staff';
import { completeStaffStepAction } from '@/app/actions/onboarding';

type Role = 'manager' | 'waiter' | 'kitchen' | 'cashier';

const ROLE_OPTIONS: Array<{ value: Role; label: string; helper: string }> = [
  { value: 'manager', label: 'Manager', helper: 'Runs the restaurant. No billing.' },
  { value: 'waiter', label: 'Waiter', helper: 'Front of house. Tables and bills.' },
  { value: 'kitchen', label: 'Kitchen', helper: 'KDS only. Prep and ready.' },
  { value: 'cashier', label: 'Cashier', helper: 'Payments and refunds.' },
];

interface ExistingInvite {
  id: string;
  email: string;
  role: string;
}

interface Props {
  canInvite: boolean;
  remainingSlots: number;
  existingInvites: ExistingInvite[];
  existingMemberCount: number;
}

export function StaffInvitesForm({
  canInvite,
  remainingSlots,
  existingInvites,
  existingMemberCount,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('manager');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviting, startInvite] = useTransition();
  const [continuing, startContinue] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revoking, startRevoke] = useTransition();

  const onInvite = (): void => {
    setError(null);
    setSuccess(null);
    startInvite(async () => {
      const result = await inviteStaffAction({ email, role, customPermissions: [] });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(`Invite sent to ${email}.`);
      setEmail('');
      router.refresh();
    });
  };

  const onRevoke = (id: string): void => {
    setError(null);
    setSuccess(null);
    setRevokingId(id);
    startRevoke(async () => {
      const result = await revokeInviteAction(id);
      if (!result.ok) {
        setError(result.error);
        setRevokingId(null);
        return;
      }
      setRevokingId(null);
      router.refresh();
    });
  };

  const onContinue = (): void => {
    setError(null);
    startContinue(async () => {
      const result = await completeStaffStepAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/onboarding/go-live');
    });
  };

  const slotsLeft = Math.max(0, remainingSlots - 0);
  const inviteDisabled = !canInvite || slotsLeft === 0;

  return (
    <div className="flex flex-col gap-6">
      {canInvite ? (
        <section className="border-border space-y-3 rounded-md border p-4">
          <h2 className="text-base font-semibold">Add a teammate</h2>
          <p className="text-muted-foreground text-xs">
            {slotsLeft} of 3 invite slot{slotsLeft === 1 ? '' : 's'} left during onboarding. Add
            more from <span className="font-mono">Staff</span> later.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="border-border h-9 rounded-md border px-3"
                autoComplete="off"
                disabled={inviteDisabled}
              />
            </label>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Role</legend>
              {ROLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`border-border flex cursor-pointer flex-col gap-0.5 rounded-md border p-2 text-sm ${
                    role === option.value ? 'bg-accent' : 'hover:bg-muted/40'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value={option.value}
                      checked={role === option.value}
                      onChange={() => setRole(option.value)}
                      disabled={inviteDisabled}
                      className="h-3 w-3"
                    />
                    <span className="font-medium">{option.label}</span>
                  </span>
                  <span className="text-muted-foreground pl-5 text-xs">{option.helper}</span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              onClick={onInvite}
              disabled={inviteDisabled || !email || inviting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 w-fit items-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
            >
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          You don&apos;t have permission to invite staff during onboarding. Continue to go-live and
          ask the owner to invite the team.
        </p>
      )}

      {existingInvites.length > 0 ? (
        <section className="border-border space-y-2 rounded-md border p-4">
          <h2 className="text-base font-semibold">Pending invites</h2>
          <ul className="divide-border divide-y text-sm">
            {existingInvites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="text-foreground font-medium">{invite.email}</span>
                  <span className="text-muted-foreground ml-2 text-xs uppercase">
                    {invite.role}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRevoke(invite.id)}
                  disabled={revoking && revokingId === invite.id}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  {revoking && revokingId === invite.id ? 'Revoking…' : 'Revoke'}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            {existingMemberCount} active member{existingMemberCount === 1 ? '' : 's'} on the team
            today.
          </p>
        </section>
      ) : null}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onContinue}
          disabled={continuing}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
        >
          {continuing
            ? 'Continuing…'
            : existingInvites.length === 0
              ? 'Skip & continue'
              : 'Continue'}
        </button>
      </div>
    </div>
  );
}
