/**
 * Demo seed script — creates one tenant + owner so a fresh dev environment
 * has something to log into without going through the signup flow.
 *
 * Usage (from repo root):
 *   pnpm db:seed
 *
 * Idempotent: re-running upserts the same records by their unique slugs.
 */

import { Types } from 'mongoose';
import { closeAllConnections, createConnectionFromUri, getModels } from '@menukaze/db';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';

async function main(): Promise<void> {
  const uri = process.env['MONGODB_URI'] ?? DEFAULT_URI;
  const dbName = process.env['MONGODB_DB_LIVE'] ?? 'menukaze_live';

  const conn = await createConnectionFromUri(uri, dbName);
  const { Restaurant, User, StaffMembership } = getModels(conn);

  // Demo restaurant
  const slug = 'demo';
  const existingRestaurant = await Restaurant.findOne({ slug }).exec();
  const restaurantId = existingRestaurant?._id ?? new Types.ObjectId();

  await Restaurant.findOneAndUpdate(
    { slug },
    {
      $setOnInsert: {
        _id: restaurantId,
        slug,
        name: 'Demo Restaurant',
        country: 'IN',
        currency: 'INR',
        locale: 'en-IN',
        timezone: 'Asia/Kolkata',
        addressStructured: {
          line1: '1 Example Street',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
          country: 'IN',
        },
        geo: { type: 'Point', coordinates: [77.5946, 12.9716] },
        wifiPublicIps: [],
        hours: [],
        subscriptionStatus: 'trial',
        geofenceRadiusM: 100,
        hardening: {
          strictMode: false,
          wifiGate: false,
          firstOrderDelayS: 0,
          maxSessionsPerTable: 1,
          geofenceRadiusM: 100,
        },
        taxRules: [],
        receiptBranding: { socials: [] },
        notificationPrefs: { email: true, dashboard: true, sound: true },
      },
    },
    { upsert: true, new: true },
  ).exec();

  // Owner user (BetterAuth-compatible — passwordHash left empty so login flows
  // through signup, not seed)
  const ownerEmail = 'owner@demo.menukaze.dev';
  const existingOwner = await User.findOne({ emailLower: ownerEmail }).exec();
  const ownerId = existingOwner?._id ?? new Types.ObjectId();

  if (!existingOwner) {
    await User.create({
      _id: ownerId,
      email: ownerEmail,
      emailLower: ownerEmail,
      emailVerified: true,
      name: 'Demo Owner',
      locale: 'en-IN',
      type: 'staff',
    });
  }

  // Owner membership
  await StaffMembership.findOneAndUpdate(
    { restaurantId, userId: ownerId },
    {
      $setOnInsert: {
        restaurantId,
        userId: ownerId,
        role: 'owner',
        status: 'active',
      },
    },
    { upsert: true, new: true },
  ).exec();

  process.stdout.write(
    `seed: ok  restaurant=${slug} (${String(restaurantId)})  owner=${ownerEmail} (${String(ownerId)})\n`,
  );

  await closeAllConnections();
  await conn.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`seed failed: ${String(error)}\n`);
  process.exit(1);
});
