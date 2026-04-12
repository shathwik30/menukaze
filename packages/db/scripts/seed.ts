/**
 * Demo seed script — creates one usable tenant with menu, tables, and a
 * sample order so local dev and CI can exercise the product immediately.
 *
 * Usage (from repo root):
 *   pnpm db:seed
 *
 * Idempotent: re-running upserts the same records by stable demo identifiers.
 */

import { Types } from 'mongoose';
import {
  closeAllConnections,
  createConnectionFromUri,
  generateQrToken,
  getModels,
} from '@menukaze/db';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';
const DEMO_SLUG = 'demo';
const DEMO_OWNER_EMAIL = 'owner@demo.menukaze.dev';
const DEMO_ORDER_ID = 'MK-DEMO1';

async function main(): Promise<void> {
  const uri = process.env['MONGODB_URI'] ?? DEFAULT_URI;
  const dbName = process.env['MONGODB_DB_LIVE'] ?? 'menukaze_live';

  const conn = await createConnectionFromUri(uri, dbName);
  const { Restaurant, User, StaffMembership, Menu, Category, Item, Table, Order } = getModels(conn);

  const restaurantId = await ensureRestaurant(Restaurant);
  const ownerId = await ensureOwner(User, StaffMembership, restaurantId);
  const { featuredItemId, itemCount } = await ensureMenu(Menu, Category, Item, restaurantId);
  const tableCount = await ensureTables(Table, restaurantId);
  await ensureSampleOrder(Order, restaurantId, featuredItemId);

  process.stdout.write(
    `seed: ok restaurant=${DEMO_SLUG} items=${String(itemCount)} tables=${String(tableCount)} owner=${DEMO_OWNER_EMAIL} (${String(ownerId)}) order=${DEMO_ORDER_ID}\n`,
  );

  await closeAllConnections();
  await conn.close();
}

async function ensureRestaurant(Restaurant: ReturnType<typeof getModels>['Restaurant']) {
  const existingRestaurant = await Restaurant.findOne({ slug: DEMO_SLUG }).exec();
  const restaurantId = existingRestaurant?._id ?? new Types.ObjectId();

  await Restaurant.findOneAndUpdate(
    { slug: DEMO_SLUG },
    {
      $set: {
        name: 'Demo Restaurant',
        description: 'Modern Indian comfort food, quick pickup, and dine-in favourites.',
        email: 'hello@demo.menukaze.dev',
        phone: '+919999999999',
        country: 'IN',
        currency: 'INR',
        locale: 'en-IN',
        timezone: 'Asia/Kolkata',
        estimatedPrepMinutes: 20,
        minimumOrderMinor: 0,
        deliveryFeeMinor: 4000,
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
        onboardingStep: 'complete',
        liveAt: new Date('2026-01-01T00:00:00.000Z'),
        checklistDismissed: false,
        geofenceRadiusM: 100,
        hardening: {
          strictMode: false,
          wifiGate: false,
          firstOrderDelayS: 0,
          maxSessionsPerTable: 1,
          geofenceRadiusM: 100,
        },
        holidayMode: {
          enabled: false,
        },
        throttling: {
          enabled: false,
          maxConcurrentOrders: 20,
        },
        taxRules: [],
        receiptBranding: { socials: [] },
        notificationPrefs: { email: true, dashboard: true, sound: true },
      },
      $setOnInsert: {
        _id: restaurantId,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).exec();

  return restaurantId;
}

async function ensureOwner(
  User: ReturnType<typeof getModels>['User'],
  StaffMembership: ReturnType<typeof getModels>['StaffMembership'],
  restaurantId: Types.ObjectId,
) {
  const existingOwner = await User.findOne({ emailLower: DEMO_OWNER_EMAIL }).exec();
  const ownerId = existingOwner?._id ?? new Types.ObjectId();

  await User.findOneAndUpdate(
    { emailLower: DEMO_OWNER_EMAIL },
    {
      $set: {
        email: DEMO_OWNER_EMAIL,
        emailLower: DEMO_OWNER_EMAIL,
        emailVerified: true,
        name: 'Demo Owner',
        locale: 'en-IN',
        type: 'staff',
      },
      $setOnInsert: {
        _id: ownerId,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).exec();

  await StaffMembership.findOneAndUpdate(
    { restaurantId, userId: ownerId },
    {
      $set: {
        role: 'owner',
        status: 'active',
      },
      $setOnInsert: {
        restaurantId,
        userId: ownerId,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).exec();

  return ownerId;
}

async function ensureMenu(
  Menu: ReturnType<typeof getModels>['Menu'],
  Category: ReturnType<typeof getModels>['Category'],
  Item: ReturnType<typeof getModels>['Item'],
  restaurantId: Types.ObjectId,
) {
  const menu = await Menu.findOneAndUpdate(
    { restaurantId, name: 'All Day Menu' },
    {
      $set: {
        order: 0,
      },
      $setOnInsert: {
        restaurantId,
        name: 'All Day Menu',
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).exec();

  if (!menu) {
    throw new Error('seed failed: could not create demo menu');
  }

  const categories = await Promise.all([
    Category.findOneAndUpdate(
      { restaurantId, menuId: menu._id, name: 'Chef Specials' },
      {
        $set: { order: 0 },
        $setOnInsert: { restaurantId, menuId: menu._id, name: 'Chef Specials' },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec(),
    Category.findOneAndUpdate(
      { restaurantId, menuId: menu._id, name: 'Drinks' },
      {
        $set: { order: 1 },
        $setOnInsert: { restaurantId, menuId: menu._id, name: 'Drinks' },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec(),
  ]);

  const chefSpecials = categories[0];
  const drinks = categories[1];
  if (!chefSpecials || !drinks) {
    throw new Error('seed failed: could not create demo categories');
  }

  const seededItems = [
    {
      categoryId: chefSpecials._id,
      name: 'Paneer Tikka',
      description: 'Charred cottage cheese, mint chutney, pickled onion.',
      priceMinor: 32000,
      dietaryTags: ['vegetarian', 'gluten-free'],
    },
    {
      categoryId: chefSpecials._id,
      name: 'Butter Chicken Bowl',
      description: 'Smoky tomato makhani, basmati rice, fresh coriander.',
      priceMinor: 42000,
      dietaryTags: [],
    },
    {
      categoryId: drinks._id,
      name: 'Masala Lemon Soda',
      description: 'Sparkling lemon, black salt, roasted cumin.',
      priceMinor: 9000,
      dietaryTags: ['vegan'],
    },
  ];

  let featuredItemId = new Types.ObjectId();

  for (const [index, item] of seededItems.entries()) {
    const doc = await Item.findOneAndUpdate(
      { restaurantId, categoryId: item.categoryId, name: item.name },
      {
        $set: {
          description: item.description,
          priceMinor: item.priceMinor,
          currency: 'INR',
          dietaryTags: item.dietaryTags,
          modifiers: [],
          soldOut: false,
        },
        $setOnInsert: {
          restaurantId,
          categoryId: item.categoryId,
          name: item.name,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec();

    if (!doc) {
      throw new Error(`seed failed: could not create demo item ${item.name}`);
    }

    if (index === 0) {
      featuredItemId = doc._id;
    }
  }

  return { featuredItemId, itemCount: seededItems.length };
}

async function ensureTables(
  Table: ReturnType<typeof getModels>['Table'],
  restaurantId: Types.ObjectId,
) {
  const count = 10;

  for (let number = 1; number <= count; number += 1) {
    const existingTable = await Table.findOne({ restaurantId, number }).exec();

    await Table.findOneAndUpdate(
      { restaurantId, number },
      {
        $set: {
          name: `Table ${String(number)}`,
          capacity: 4,
          zone: number <= 6 ? 'Dining Room' : 'Patio',
          status: 'available',
        },
        $setOnInsert: {
          restaurantId,
          number,
          qrToken: existingTable?.qrToken ?? generateQrToken(),
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec();
  }

  return count;
}

async function ensureSampleOrder(
  Order: ReturnType<typeof getModels>['Order'],
  restaurantId: Types.ObjectId,
  itemId: Types.ObjectId,
) {
  const now = new Date('2026-01-01T09:00:00.000Z');
  const lineTotalMinor = 32000;

  await Order.findOneAndUpdate(
    { restaurantId, publicOrderId: DEMO_ORDER_ID },
    {
      $set: {
        channel: 'storefront',
        type: 'pickup',
        customer: {
          name: 'Demo Customer',
          email: 'customer@demo.menukaze.dev',
          phone: '+919999999998',
        },
        items: [
          {
            itemId,
            name: 'Paneer Tikka',
            priceMinor: 32000,
            quantity: 1,
            modifiers: [],
            lineTotalMinor,
          },
        ],
        subtotalMinor: lineTotalMinor,
        taxMinor: 0,
        tipMinor: 0,
        totalMinor: lineTotalMinor,
        currency: 'INR',
        status: 'received',
        statusHistory: [{ status: 'received', at: now }],
        payment: {
          gateway: 'razorpay',
          status: 'succeeded',
          amountMinor: lineTotalMinor,
          currency: 'INR',
          paidAt: now,
        },
      },
      $setOnInsert: {
        restaurantId,
        publicOrderId: DEMO_ORDER_ID,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).exec();
}

main().catch((error: unknown) => {
  process.stderr.write(`seed failed: ${String(error)}\n`);
  process.exit(1);
});
