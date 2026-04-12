'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FLAGS, OWNER_ONLY_FLAGS } from '@menukaze/rbac';
import {
  inviteStaffAction,
  revokeInviteAction,
  changeRoleAction,
  removeStaffAction,
} from '@/app/actions/staff';

export type StaffRole = 'owner' | 'manager' | 'waiter' | 'kitchen' | 'cashier' | 'custom';

export interface StaffMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  customPermissions: string[];
  status: 'active' | 'deactivated';
}

export interface StaffInviteRow {
  id: string;
  email: string;
  role: StaffRole;
  customPermissions: string[];
  expiresAt: string;
}

interface Props {
  currentUserId: string;
  members: StaffMember[];
  invites: StaffInviteRow[];
}

const ROLE_OPTIONS: StaffRole[] = ['owner', 'manager', 'waiter', 'kitchen', 'cashier', 'custom'];
const ROLE_OPTION_SET: ReadonlySet<string> = new Set(ROLE_OPTIONS);
const CUSTOM_FLAG_OPTIONS = FLAGS.filter((flag) => !OWNER_ONLY_FLAGS.has(flag));
const FLAG_GROUPS = Array.from(
  CUSTOM_FLAG_OPTIONS.reduce((groups, flag) => {
    const group = flag.split('.')[0] ?? 'other';
    const bucket = groups.get(group) ?? [];
    bucket.push(flag);
    groups.set(group, bucket);
    return groups;
  }, new Map<string, string[]>()).entries(),
);

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function isStaffRole(value: string): value is StaffRole {
  return ROLE_OPTION_SET.has(value);
}

function describeRole(role: StaffRole, customPermissions: string[]) {
  if (role !== 'custom') return titleCase(role);
  return customPermissions.length > 0
    ? `Custom (${customPermissions.length} permission${customPermissions.length === 1 ? '' : 's'})`
    : 'Custom';
}

function FlagChecklist({
  selected,
  disabled,
  onToggle,
}: {
  selected: string[];
  disabled: boolean;
  onToggle: (flag: string) => void;
}) {
  return (
    <div className="border-border rounded-md border p-3">
      <p className="text-sm font-medium">Custom permission flags</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Owner-only capabilities stay excluded. Pick the exact operational access this role needs.
      </p>
      <div className="mt-3 space-y-3">
        {FLAG_GROUPS.map(([group, flags]) => (
          <section key={group}>
            <p className="text-foreground text-xs font-semibold uppercase tracking-wide">
              {titleCase(group)}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {flags.map((flag) => (
                <label key={flag} className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.includes(flag)}
                    disabled={disabled}
                    onChange={() => onToggle(flag)}
                  />
                  <span>{titleCase(flag.split('.').slice(1).join(' '))}</span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function InviteForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (payload: { email: string; role: StaffRole; customPermissions: string[] }) => void;
}) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<StaffRole>('waiter');
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);

  function toggleFlag(flag: string) {
    setCustomPermissions((current) =>
      current.includes(flag) ? current.filter((value) => value !== flag) : [...current, flag],
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!inviteEmail) return;
        onSubmit({
          email: inviteEmail,
          role: inviteRole,
          customPermissions: inviteRole === 'custom' ? customPermissions : [],
        });
        setInviteEmail('');
        setInviteRole('waiter');
        setCustomPermissions([]);
      }}
      className="mt-3 flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-end gap-2">
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
            onChange={(e) => {
              if (!isStaffRole(e.target.value)) return;
              const nextRole = e.target.value;
              setInviteRole(nextRole);
              if (nextRole !== 'custom') setCustomPermissions([]);
            }}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {titleCase(role)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium disabled:opacity-50"
        >
          Send invite
        </button>
      </div>

      {inviteRole === 'custom' ? (
        <FlagChecklist selected={customPermissions} disabled={pending} onToggle={toggleFlag} />
      ) : null}
    </form>
  );
}

function MemberRow({
  member,
  isCurrentUser,
  pending,
  onSave,
  onRemove,
}: {
  member: StaffMember;
  isCurrentUser: boolean;
  pending: boolean;
  onSave: (payload: { membershipId: string; role: StaffRole; customPermissions: string[] }) => void;
  onRemove: (membershipId: string, email: string) => void;
}) {
  const [role, setRole] = useState<StaffRole>(member.role);
  const [customPermissions, setCustomPermissions] = useState<string[]>(member.customPermissions);

  // Re-sync when RSC passes fresh member props after a save + router.refresh().
  useEffect(() => {
    setRole(member.role);
    setCustomPermissions(member.customPermissions);
  }, [member.role, member.customPermissions]);

  function toggleFlag(flag: string) {
    setCustomPermissions((current) =>
      current.includes(flag) ? current.filter((value) => value !== flag) : [...current, flag],
    );
  }

  return (
    <li
      className={
        member.status === 'deactivated'
          ? 'flex flex-col gap-3 py-3 opacity-50'
          : 'flex flex-col gap-3 py-3'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-foreground font-medium">
            {member.name || member.email}
            {isCurrentUser ? (
              <span className="text-muted-foreground ml-2 text-[10px] uppercase">(you)</span>
            ) : null}
          </p>
          <p className="text-muted-foreground text-xs">
            {member.email} · {describeRole(member.role, member.customPermissions)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={role}
            disabled={pending || isCurrentUser}
            onChange={(e) => {
              if (!isStaffRole(e.target.value)) return;
              const nextRole = e.target.value;
              setRole(nextRole);
              if (nextRole !== 'custom') setCustomPermissions([]);
            }}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || isCurrentUser}
            onClick={() =>
              onSave({
                membershipId: member.membershipId,
                role,
                customPermissions: role === 'custom' ? customPermissions : [],
              })
            }
            className="border-input h-8 rounded-md border px-3 text-xs disabled:opacity-50"
          >
            Save role
          </button>
          {!isCurrentUser && member.status === 'active' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onRemove(member.membershipId, member.email)}
              className="text-destructive text-xs underline"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {role === 'custom' ? (
        <FlagChecklist
          selected={customPermissions}
          disabled={pending || isCurrentUser}
          onToggle={toggleFlag}
        />
      ) : null}
    </li>
  );
}

export function StaffClient({ currentUserId, members, invites }: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        <InviteForm
          pending={isPending}
          onSubmit={(payload) => run(() => inviteStaffAction(payload))}
        />
      </section>

      {invites.length > 0 ? (
        <section className="border-border rounded-lg border p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Pending invites</h2>
          <ul className="divide-border mt-3 divide-y text-sm">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-4 py-2"
              >
                <span>
                  <span className="text-foreground font-medium">{invite.email}</span>{' '}
                  <span className="text-muted-foreground text-xs">
                    · {describeRole(invite.role, invite.customPermissions)}
                  </span>
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
            {members.map((member) => (
              <MemberRow
                key={member.membershipId}
                member={member}
                isCurrentUser={member.userId === currentUserId}
                pending={isPending}
                onSave={(payload) => run(() => changeRoleAction(payload))}
                onRemove={(membershipId, email) => {
                  if (window.confirm(`Remove ${email}?`)) {
                    run(() => removeStaffAction(membershipId));
                  }
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}
    </>
  );
}
