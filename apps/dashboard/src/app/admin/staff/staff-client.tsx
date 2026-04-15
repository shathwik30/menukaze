'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FLAGS, OWNER_ONLY_FLAGS, type StaffRole } from '@menukaze/rbac';
import type { StaffMembershipStatus } from '@menukaze/shared';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FieldError,
  Input,
  Label,
  Select,
  cn,
} from '@menukaze/ui';
import {
  inviteStaffAction,
  revokeInviteAction,
  changeRoleAction,
  removeStaffAction,
} from '@/app/actions/staff';

export type { StaffRole };

export interface StaffMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  customPermissions: string[];
  status: StaffMembershipStatus;
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
  currentUserRole: StaffRole;
  members: StaffMember[];
  invites: StaffInviteRow[];
  canInvite: boolean;
  canEdit: boolean;
  canRemove: boolean;
  roleOptions: StaffRole[];
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

const ROLE_TONE: Record<StaffRole, 'accent' | 'success' | 'info' | 'warning' | 'subtle'> = {
  owner: 'accent',
  manager: 'info',
  waiter: 'success',
  kitchen: 'warning',
  cashier: 'subtle',
  custom: 'subtle',
};

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function isStaffRole(value: string): value is StaffRole {
  return ROLE_OPTION_SET.has(value);
}

function describeRole(role: StaffRole, customPermissions: string[]) {
  if (role !== 'custom') return titleCase(role);
  return customPermissions.length > 0
    ? `Custom · ${customPermissions.length} permission${customPermissions.length === 1 ? '' : 's'}`
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
    <div className="border-ink-200 bg-canvas-50/70 dark:border-ink-800 dark:bg-ink-900/50 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <p className="text-ink-600 dark:text-ink-400 text-[11px] font-semibold uppercase tracking-[0.14em]">
          Custom permission flags
        </p>
        <Badge variant="subtle" size="xs">
          {selected.length} selected
        </Badge>
      </div>
      <p className="text-ink-500 dark:text-ink-400 mt-1 text-xs">
        Owner-only capabilities stay excluded. Pick the exact operational access this role needs.
      </p>
      <div className="mt-4 space-y-4">
        {FLAG_GROUPS.map(([group, flags]) => (
          <section key={group}>
            <p className="text-ink-500 dark:text-ink-400 text-[11px] font-semibold uppercase tracking-[0.12em]">
              {titleCase(group)}
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {flags.map((flag) => {
                const active = selected.includes(flag);
                return (
                  <label
                    key={flag}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                      active
                        ? 'border-saffron-500/60 bg-saffron-50 text-ink-950 dark:bg-saffron-500/10 dark:text-canvas-50'
                        : 'border-ink-200 bg-surface hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-ink-700',
                      disabled && 'pointer-events-none opacity-50',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                        active
                          ? 'border-saffron-600 bg-saffron-500 text-white'
                          : 'border-ink-300 dark:border-ink-600',
                      )}
                    >
                      {active ? (
                        <svg
                          viewBox="0 0 12 12"
                          className="size-2.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      ) : null}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={active}
                      disabled={disabled}
                      onChange={() => onToggle(flag)}
                    />
                    <span className="font-mono text-[11px] leading-tight">
                      {flag.split('.').slice(1).join('.')}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function InviteForm({
  pending,
  roleOptions,
  onSubmit,
}: {
  pending: boolean;
  roleOptions: StaffRole[];
  onSubmit: (payload: { email: string; role: StaffRole; customPermissions: string[] }) => void;
}) {
  const [inviteEmail, setInviteEmail] = useState('');
  const defaultInviteRole = roleOptions[0] ?? 'waiter';
  const [inviteRole, setInviteRole] = useState<StaffRole>(defaultInviteRole);
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (!roleOptions.includes(inviteRole) && roleOptions[0]) {
      setInviteRole(roleOptions[0]);
      setCustomPermissions([]);
    }
  }, [inviteRole, roleOptions]);

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
        setInviteRole(defaultInviteRole);
        setCustomPermissions([]);
      }}
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email" required>
            Email
          </Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="alex@restaurant.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            id="invite-role"
            value={inviteRole}
            onChange={(e) => {
              if (!isStaffRole(e.target.value)) return;
              const nextRole = e.target.value;
              setInviteRole(nextRole);
              if (nextRole !== 'custom') setCustomPermissions([]);
            }}
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {titleCase(role)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="primary" size="md" disabled={pending} loading={pending}>
          Send invite
        </Button>
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
  currentUserRole,
  pending,
  roleOptions,
  canEdit,
  canRemove,
  onSave,
  onRemove,
}: {
  member: StaffMember;
  isCurrentUser: boolean;
  currentUserRole: StaffRole;
  pending: boolean;
  roleOptions: StaffRole[];
  canEdit: boolean;
  canRemove: boolean;
  onSave: (payload: { membershipId: string; role: StaffRole; customPermissions: string[] }) => void;
  onRemove: (membershipId: string, email: string) => void;
}) {
  const [role, setRole] = useState<StaffRole>(member.role);
  const [customPermissions, setCustomPermissions] = useState<string[]>(member.customPermissions);
  const canManageOwnerMember = member.role !== 'owner' || currentUserRole === 'owner';
  const canManageCustomMember = member.role !== 'custom' || roleOptions.includes('custom');
  const canEditMember = canEdit && !isCurrentUser && canManageOwnerMember && canManageCustomMember;
  const canRemoveMember =
    canRemove && !isCurrentUser && canManageOwnerMember && member.status === 'active';
  const canShowMemberActions = canEditMember || canRemoveMember;
  const memberRoleOptions = roleOptions.includes(member.role)
    ? roleOptions
    : [member.role, ...roleOptions];

  useEffect(() => {
    setRole(member.role);
    setCustomPermissions(member.customPermissions);
  }, [member.role, member.customPermissions]);

  function toggleFlag(flag: string) {
    setCustomPermissions((current) =>
      current.includes(flag) ? current.filter((value) => value !== flag) : [...current, flag],
    );
  }

  const deactivated = member.status === 'deactivated';

  return (
    <li className={cn('flex flex-col gap-3 py-4', deactivated && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar fallback={member.name || member.email} size="md" />
          <div className="min-w-0">
            <p className="text-foreground flex items-center gap-2 font-medium">
              {member.name || member.email}
              {isCurrentUser ? (
                <span className="text-ink-400 text-[10px] font-medium uppercase tracking-[0.14em]">
                  (you)
                </span>
              ) : null}
              {deactivated ? (
                <Badge variant="danger" size="xs" shape="pill">
                  Deactivated
                </Badge>
              ) : null}
            </p>
            <p className="text-ink-500 dark:text-ink-400 truncate text-[12.5px]">{member.email}</p>
          </div>
          <Badge variant={ROLE_TONE[member.role]} size="sm" shape="pill">
            {describeRole(member.role, member.customPermissions)}
          </Badge>
        </div>

        {canShowMemberActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {canEditMember ? (
              <>
                <Select
                  value={role}
                  disabled={pending}
                  onChange={(e) => {
                    if (!isStaffRole(e.target.value)) return;
                    const nextRole = e.target.value;
                    setRole(nextRole);
                    if (nextRole !== 'custom') setCustomPermissions([]);
                  }}
                  className="h-9 w-auto text-xs"
                >
                  {memberRoleOptions.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    onSave({
                      membershipId: member.membershipId,
                      role,
                      customPermissions: role === 'custom' ? customPermissions : [],
                    })
                  }
                >
                  Save
                </Button>
              </>
            ) : null}
            {canRemoveMember ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => onRemove(member.membershipId, member.email)}
                className="text-mkrose-600 hover:text-mkrose-700"
              >
                Remove
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {role === 'custom' && canEditMember ? (
        <FlagChecklist selected={customPermissions} disabled={pending} onToggle={toggleFlag} />
      ) : null}
    </li>
  );
}

export function StaffClient({
  currentUserId,
  currentUserRole,
  members,
  invites,
  canInvite,
  canEdit,
  canRemove,
  roleOptions,
}: Props) {
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
    <div className="flex flex-col gap-6">
      {canInvite && roleOptions.length > 0 ? (
        <Card variant="surface" radius="lg">
          <CardHeader>
            <CardTitle>Invite a team member</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm
              pending={isPending}
              roleOptions={roleOptions}
              onSubmit={(payload) => run(() => inviteStaffAction(payload))}
            />
          </CardContent>
        </Card>
      ) : null}

      {invites.length > 0 ? (
        <Card variant="surface" radius="lg">
          <CardHeader>
            <CardTitle className="text-base">Pending invites</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-ink-100 dark:divide-ink-800 divide-y">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar fallback={invite.email} size="sm" />
                    <div>
                      <p className="text-foreground text-sm font-medium">{invite.email}</p>
                      <p className="text-ink-500 dark:text-ink-400 text-[11px]">
                        {describeRole(invite.role, invite.customPermissions)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge variant="subtle" size="sm" shape="pill">
                      Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </Badge>
                    {canInvite ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => run(() => revokeInviteAction(invite.id))}
                        className="text-mkrose-600 hover:text-mkrose-700"
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card variant="surface" radius="lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Team</CardTitle>
            <Badge variant="subtle" size="sm" shape="pill">
              {members.length} member{members.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <EmptyState
              compact
              title="No team members yet"
              description="Invite people above to give them dashboard access."
            />
          ) : (
            <ul className="divide-ink-100 dark:divide-ink-800 divide-y">
              {members.map((member) => (
                <MemberRow
                  key={member.membershipId}
                  member={member}
                  isCurrentUser={member.userId === currentUserId}
                  currentUserRole={currentUserRole}
                  pending={isPending}
                  roleOptions={roleOptions}
                  canEdit={canEdit}
                  canRemove={canRemove}
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
        </CardContent>
      </Card>

      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
