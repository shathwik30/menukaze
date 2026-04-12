import Link from 'next/link';
import { Types } from 'mongoose';
import { QRCodeSVG } from 'qrcode.react';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboarded } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Bulk-print page for every table QR sticker in the restaurant.
 *
 * We intentionally rely on the browser's print dialog so staff can either
 * send directly to paper or "Save as PDF" without bringing a PDF library
 * into the app bundle.
 */
export default async function PrintAllTablesPage() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const conn = await getMongoConnection('live');
  const { Restaurant, Table } = getModels(conn);
  const [restaurant, tables] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Table.find({ restaurantId }).sort({ number: 1 }).lean().exec(),
  ]);

  if (!restaurant) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 bg-white p-8 text-black print:max-w-none print:p-0">
      <header className="print:hidden">
        <Link href="/admin/tables" className="text-sm underline underline-offset-4">
          ← Back to tables
        </Link>
        <h1 className="mt-3 text-3xl font-bold">{restaurant.name} QR pack</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Print directly or choose “Save as PDF” in your browser print dialog.
        </p>
      </header>

      {tables.length === 0 ? (
        <p className="text-sm text-zinc-600">No tables found.</p>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
          {tables.map((table) => {
            const url = `https://${restaurant.slug}.menukaze.com/t/${table.qrToken}`;

            return (
              <article
                key={String(table._id)}
                className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-zinc-300 p-6 text-center print:break-inside-avoid print:border-zinc-200"
              >
                <p className="text-xs uppercase tracking-[0.2em]">{restaurant.name}</p>
                <QRCodeSVG value={url} size={220} level="H" />
                <p className="text-2xl font-bold">{table.name}</p>
                <p className="text-sm text-zinc-600">Scan to order · Pay when you&apos;re done</p>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
