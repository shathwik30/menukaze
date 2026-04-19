'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card, FieldError, FieldHint, Input, Label, Radio, cn } from '@menukaze/ui';
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
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-semibold">Add a teammate</h2>
          <FieldHint>
            {slotsLeft} of 3 invite slot{slotsLeft === 1 ? '' : 's'} left during onboarding. Add
            more from <span className="font-mono">Staff</span> later.
          </FieldHint>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                autoComplete="off"
                disabled={inviteDisabled}
              />
            </label>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Role</legend>
              {ROLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'border-border flex cursor-pointer flex-col gap-0.5 rounded-md border p-2 text-sm transition-colors',
                    role === option.value ? 'bg-accent' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Radio
                      name="role"
                      value={option.value}
                      checked={role === option.value}
                      onChange={() => setRole(option.value)}
                      disabled={inviteDisabled}
                    />
                    <span className="font-medium">{option.label}</span>
                  </span>
                  <span className="text-muted-foreground pl-5 text-xs">{option.helper}</span>
                </label>
              ))}
            </fieldset>
            <Button
              type="button"
              onClick={onInvite}
              disabled={inviteDisabled || !email || inviting}
              loading={inviting}
              className="w-fit"
            >
              Send invite
            </Button>
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">
          You don&apos;t have permission to invite staff during onboarding. Continue to go-live and
          ask the owner to invite the team.
        </p>
      )}

      {existingInvites.length > 0 ? (
        <Card className="space-y-2 p-4">
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
                <Button
                  type="button"
                  onClick={() => onRevoke(invite.id)}
                  disabled={revoking && revokingId === invite.id}
                  variant="link"
                  size="xs"
                  className="text-red-600"
                >
                  {revoking && revokingId === invite.id ? 'Revoking…' : 'Revoke'}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            {existingMemberCount} active member{existingMemberCount === 1 ? '' : 's'} on the team
            today.
          </p>
        </Card>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="button" onClick={onContinue} disabled={continuing} loading={continuing}>
          {existingInvites.length === 0 ? 'Skip & continue' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
