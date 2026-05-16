import { formatMoney } from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';
import { loadAnalyticsData } from '../analytics-data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const { restaurantId } = await requirePageFlag(['analytics.view']);
  const url = new URL(request.url);
  const data = await loadAnalyticsData(restaurantId, {
    days: url.searchParams.get('days') ?? undefined,
    channel: url.searchParams.get('channel') ?? undefined,
  });

  const csv = buildAnalyticsCsv(data);
  const filename = `${data.restaurantSlug}-analytics-${data.days}d.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function buildAnalyticsCsv(data: Awaited<ReturnType<typeof loadAnalyticsData>>): string {
  const rows: string[][] = [
    [
      'section',
      'date',
      'label',
      'channel',
      'item',
      'orders',
      'quantity',
      'revenue_minor',
      'revenue',
    ],
    [
      'summary',
      '',
      'Paid revenue',
      data.channel,
      '',
      String(data.totalsRow.orders),
      '',
      String(data.totalsRow.revenue),
      formatMoney(data.totalsRow.revenue, data.currency, data.locale),
    ],
  ];

  for (const day of data.dailySeries) {
    rows.push([
      'daily',
      day.date,
      '',
      data.channel,
      '',
      String(day.orders),
      '',
      String(day.revenue),
      formatMoney(day.revenue, data.currency, data.locale),
    ]);
  }

  for (const channel of data.channelRows) {
    rows.push([
      'channel',
      '',
      channel.label,
      channel.id,
      '',
      String(channel.orders),
      '',
      String(channel.revenue),
      formatMoney(channel.revenue, data.currency, data.locale),
    ]);
  }

  for (const item of data.topItems) {
    rows.push([
      'item',
      '',
      item.name,
      data.channel,
      item.name,
      '',
      String(item.quantity),
      String(item.revenue),
      formatMoney(item.revenue, data.currency, data.locale),
    ]);
  }

  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`;
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
