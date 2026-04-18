import type { Connection, Types } from 'mongoose';
import { getModels } from './models';

export interface SupportRecipientsResult {
  restaurantName: string;
  recipients: string[];
}

export async function getRestaurantSupportRecipients(
  connection: Connection,
  restaurantId: Types.ObjectId,
): Promise<SupportRecipientsResult | null> {
  const { Restaurant, StaffMembership, User } = getModels(connection);

  const restaurant = await Restaurant.findById(restaurantId).lean().exec();
  if (!restaurant) return null;
  if (restaurant.notificationPrefs?.email === false) {
    return { restaurantName: restaurant.name, recipients: [] };
  }

  const memberships = await StaffMembership.find(
    {
      restaurantId,
      status: 'active',
      role: { $in: ['owner', 'manager'] },
    },
    { userId: 1 },
  )
    .lean()
    .exec();

  const userIds = memberships.map((membership) => membership.userId);
  const users =
    userIds.length > 0
      ? await User.find({ _id: { $in: userIds } }, { email: 1 }, { skipTenantGuard: true })
          .lean()
          .exec()
      : [];

  const emails = new Set<string>();
  if (restaurant.email) emails.add(restaurant.email.trim().toLowerCase());
  for (const user of users) {
    if (user.email) emails.add(user.email.trim().toLowerCase());
  }

  return {
    restaurantName: restaurant.name,
    recipients: Array.from(emails),
  };
}
