'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  inviteStaffAction,
  revokeInviteAction,
  changeRoleAction,
  removeStaffAction,
} from '@/app/actions/staff';

export type StaffRole = 'owner' | 'manager' | 'waiter' | 'kitchen' | 'cashier';

export interface StaffMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  status: 'active' | 'deactivated';
}

export interface StaffInviteRow {
  id: string;
  email: string;
  role: StaffRole;
  expiresAt: string;
}

interface Props {
  currentUserId: string;
  members: StaffMember[];
  invites: StaffInviteRow[];
}

const ROLE_OPTIONS: StaffRole[] = ['owner', 'manager', 'waiter', 'kitchen', 'cashier'];

export function StaffClient({ currentUserId, members, invites }: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<StaffRole>('waiter');

  function run(
    fn: () => Promise<{ ok: true } | { ok: true; data: unknown } | { ok: false; error: string }>,
  ) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <>
      <section className="border-border rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Invite a team member</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!inviteEmail) return;
            run(() => inviteStaffAction({ email: inviteEmail, role: inviteRole }));
            setInviteEmail('');
          }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-1 flex-col gap-1 text-xs">
            Email
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Role
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as StaffRole)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium disabled:opacity-50"
          >
            Send invite
          </button>
        </form>
      </section>

      {invites.length > 0 ? (
        <section className="border-border rounded-lg border p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Pending invites</h2>
          <ul className="divide-border mt-3 divide-y text-sm">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-4 py-2">
                <span>
                  <span className="text-foreground font-medium">{invite.email}</span>{' '}
                  <span className="text-muted-foreground text-xs">· {invite.role}</span>
                </span>
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">
                    expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => revokeInviteAction(invite.id))}
                    className="text-destructive underline"
                  >
                    Revoke
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-border rounded-lg border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Team</h2>
        {members.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">No members yet.</p>
        ) : (
          <ul className="divide-border mt-3 divide-y text-sm">
            {members.map((member) => {
              const isMe = member.userId === currentUserId;
              return (
                <li
                  key={member.membershipId}
                  className={
                    member.status === 'deactivated'
                      ? 'flex items-center justify-between gap-4 py-2 opacity-50'
                      : 'flex items-center justify-between gap-4 py-2'
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground font-medium">
                      {member.name || member.email}
                    </span>
                    {isMe ? (
                      <span className="text-muted-foreground ml-2 text-[10px] uppercase">
                        (you)
                      </span>
                    ) : null}
                    <span className="text-muted-foreground text-xs"> · {member.email}</span>
                  </span>
                  <select
                    value={member.role}
                    disabled={isPending || isMe}
                    onChange={(e) => {
                      const nextRole = e.target.value as StaffRole;
                      run(() =>
                        changeRoleAction({
                          membershipId: member.membershipId,
                          role: nextRole,
                        }),
                      );
                    }}
                    className="border-input bg-background h-7 rounded-md border px-2 text-xs"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {!isMe && member.status === 'active' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${member.email}?`)) {
                          run(() => removeStaffAction(member.membershipId));
                        }
                      }}
                      className="text-destructive text-xs underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}
    </>
  );
}
