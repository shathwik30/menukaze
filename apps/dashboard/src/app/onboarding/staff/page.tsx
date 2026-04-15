import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { StaffInvitesForm } from './staff-invites-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingStaffPage() {
  const { restaurantId, permissions } = await requirePageFlag(['settings.edit_profile']);

  const conn = await getMongoConnection('live');
  const { Restaurant, StaffInvite, StaffMembership } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) redirect('/onboarding');

  if (restaurant.onboardingStep !== 'staff') {
    redirect('/admin');
  }

  const [invites, members] = await Promise.all([
    StaffInvite.find({
      restaurantId,
      usedAt: { $exists: false },
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec(),
    StaffMembership.countDocuments({ restaurantId, status: 'active' }).exec(),
  ]);

  const canInvite = permissions.includes('staff.invite');
  const remainingSlots = Math.max(0, 3 - invites.length);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">Step 5 of 6</p>
        <h1 className="mt-1 text-3xl font-bold">Invite your team</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Add up to three teammates now. They&apos;ll receive an email with a link to join. You can
          add more, change roles, or remove people later from{' '}
          <span className="font-mono">Staff</span> in the dashboard. This step is optional —
          continue when you&apos;re ready.
        </p>
      </header>

      <StaffInvitesForm
        canInvite={canInvite}
        remainingSlots={remainingSlots}
        existingInvites={invites.map((i) => ({
          id: String(i._id),
          email: i.email,
          role: i.role,
        }))}
        existingMemberCount={members}
      />

      <footer className="text-muted-foreground text-xs">
        Operating <span className="text-foreground font-mono">{restaurant.slug}</span>
      </footer>
    </main>
  );
}
