import { Types } from 'mongoose';
import { notFound } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Minimal printable QR sticker page. Opened in a new tab from the table
 * management grid; staff then prints it on adhesive paper and sticks it on
 * the table. Using the browser's print dialog keeps this free of any PDF
 * library dependency.
 */
export default async function PrintableQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();
  const { session } = await requirePageFlag(['tables.qr_print']);
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const conn = await getMongoConnection('live');
  const { Restaurant, Table } = getModels(conn);
  const [restaurant, table] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Table.findOne({ restaurantId, _id: new Types.ObjectId(id) }).exec(),
  ]);
  if (!table || !restaurant) notFound();

  const url = `https://${restaurant.slug}.menukaze.com/t/${table.qrToken}`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white p-8 text-black print:p-0">
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-zinc-300 p-8 print:border-none">
        <p className="text-xs uppercase tracking-[0.2em]">{restaurant.name}</p>
        <QRCodeSVG value={url} size={280} level="H" />
        <p className="text-2xl font-bold">{table.name}</p>
        <p className="text-sm text-zinc-600">Scan to order · Pay when you&apos;re done</p>
      </div>
      <p className="text-center text-xs text-zinc-500 print:hidden">
        Use ⌘P / Ctrl+P to print on adhesive paper.
      </p>
    </main>
  );
}
