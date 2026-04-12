import { Types } from 'mongoose';
import { getMongoConnection, getModels } from '@menukaze/db';
import { buildTablesPdf } from '@/lib/qr-pdf';
import { requireOnboarded } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const conn = await getMongoConnection('live');
  const { Restaurant, Table } = getModels(conn);
  const [restaurant, tables] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Table.find({ restaurantId }).sort({ number: 1 }).lean().exec(),
  ]);

  if (!restaurant) {
    return new Response('Restaurant not found.', { status: 404 });
  }

  const pdf = await buildTablesPdf({
    restaurantName: restaurant.name,
    tables: tables.map((table) => ({
      name: table.name,
      qrUrl: `https://${restaurant.slug}.menukaze.com/t/${table.qrToken}`,
    })),
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${restaurant.slug}-table-qrs.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
