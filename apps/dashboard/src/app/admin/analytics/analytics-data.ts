import 'server-only';

import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { currencyCodeOrDefault } from '@menukaze/shared';
import type { Types } from 'mongoose';

export const RANGE_OPTIONS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: 'YTD' },
];

const CORE_CHANNEL_OPTIONS = [
  { id: 'all', label: 'All channels' },
  { id: 'storefront', label: 'Storefront' },
  { id: 'qr_dinein', label: 'QR Dine-In' },
  { id: 'kiosk', label: 'Kiosk' },
  { id: 'walk_in', label: 'Walk-in' },
  { id: 'api', label: 'API (all integrations)' },
] as const;

const REVENUE_PAYMENT_STATUSES = ['succeeded'] as const;
const EXCLUDED_REVENUE_ORDER_STATUSES = ['cancelled'] as const;

export interface AnalyticsSearchParams {
  days?: string;
  channel?: string;
}

export interface AnalyticsFilterOption {
  id: string;
  label: string;
}

export interface AnalyticsTotalRow {
  revenue: number;
  orders: number;
}

export interface AnalyticsChannelRow extends AnalyticsTotalRow {
  id: string;
  label: string;
}

export interface AnalyticsItemRow {
  name: string;
  quantity: number;
  revenue: number;
}

export interface AnalyticsDailyRow extends AnalyticsTotalRow {
  date: string;
}

export interface AnalyticsPeakHour {
  hour: number;
  orders: number;
}

export interface AnalyticsDelta {
  pct: number;
  dir: 'up' | 'down' | 'flat';
}

export interface AnalyticsData {
  days: number;
  channel: string;
  channelOptions: AnalyticsFilterOption[];
  restaurantSlug: string;
  currency: ReturnType<typeof currencyCodeOrDefault>;
  locale: string;
  totalsRow: AnalyticsTotalRow;
  prevTotalsRow: AnalyticsTotalRow;
  aov: number;
  prevAov: number;
  revDelta: AnalyticsDelta;
  ordDelta: AnalyticsDelta;
  aovDelta: AnalyticsDelta;
  channelRows: AnalyticsChannelRow[];
  topItems: AnalyticsItemRow[];
  dailySeries: AnalyticsDailyRow[];
  peakHours: AnalyticsPeakHour[];
  peakMax: number;
  topMax: number;
}

interface ApiKeyOptionSource {
  _id: unknown;
  name?: string | null;
}

interface AggregateTotalRow {
  _id: null;
  revenue?: number | null;
  orders?: number | null;
}

interface AggregateChannelRow {
  _id: string | null;
  revenue?: number | null;
  orders?: number | null;
}

interface AggregateApiKeyRow {
  _id: Types.ObjectId | null;
  revenue?: number | null;
  orders?: number | null;
}

interface AggregateItemRow {
  _id: unknown;
  name?: string | null;
  quantity?: number | null;
  revenue?: number | null;
}

interface AggregateHourRow {
  _id: number | null;
  orders?: number | null;
}

interface AggregateDailyRow {
  _id: string;
  revenue?: number | null;
  orders?: number | null;
}

export async function loadAnalyticsData(
  restaurantId: Types.ObjectId,
  params: AnalyticsSearchParams,
): Promise<AnalyticsData> {
  const days = normalizeDays(params.days);

  const conn = await getMongoConnection('live');
  const { Order, Restaurant, ApiKey } = getModels(conn);
  const [restaurant, apiKeys] = await Promise.all([
    Restaurant.findById(restaurantId, { currency: 1, locale: 1, timezone: 1, slug: 1 })
      .lean()
      .exec(),
    ApiKey.find({ restaurantId }, { name: 1 }).sort({ createdAt: 1 }).lean().exec(),
  ]);

  const currency = currencyCodeOrDefault(restaurant?.currency);
  const locale = restaurant?.locale ?? 'en-US';
  const timezone =
    restaurant?.timezone && restaurant.timezone.length > 0 ? restaurant.timezone : 'UTC';
  const restaurantSlug = restaurant?.slug ?? 'analytics';

  const channelOptions = buildChannelOptions(apiKeys);
  const channel = normalizeChannel(params.channel, channelOptions);
  const apiKeyFilter = channel.startsWith('api:') ? parseObjectId(channel.slice(4)) : null;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000);

  const baseMatch = buildOrderMatch({ restaurantId, since, channel, apiKeyFilter });
  const prevMatch = buildOrderMatch({
    restaurantId,
    since: prevSince,
    until: since,
    channel,
    apiKeyFilter,
  });
  const shouldSplitApi = channel === 'all' || channel === 'api' || channel.startsWith('api:');
  const apiKeyMatch = shouldSplitApi ? buildApiKeyMatch(baseMatch, apiKeyFilter) : null;

  const [totals, prevTotals, byChannel, byApiKey, topItems, hourlyBuckets, dailyBuckets] =
    await Promise.all([
      Order.aggregate([
        { $match: baseMatch },
        { $group: { _id: null, revenue: { $sum: '$totalMinor' }, orders: { $sum: 1 } } },
      ]).exec() as Promise<AggregateTotalRow[]>,
      Order.aggregate([
        { $match: prevMatch },
        { $group: { _id: null, revenue: { $sum: '$totalMinor' }, orders: { $sum: 1 } } },
      ]).exec() as Promise<AggregateTotalRow[]>,
      Order.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$channel', revenue: { $sum: '$totalMinor' }, orders: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
      ]).exec() as Promise<AggregateChannelRow[]>,
      apiKeyMatch
        ? (Order.aggregate([
            { $match: apiKeyMatch },
            {
              $group: {
                _id: { $ifNull: ['$apiKeyId', null] },
                revenue: { $sum: '$totalMinor' },
                orders: { $sum: 1 },
              },
            },
            { $sort: { revenue: -1 } },
          ]).exec() as Promise<AggregateApiKeyRow[]>)
        : Promise.resolve([] as AggregateApiKeyRow[]),
      Order.aggregate([
        { $match: baseMatch },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.itemId',
            name: { $first: '$items.name' },
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.lineTotalMinor' },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]).exec() as Promise<AggregateItemRow[]>,
      Order.aggregate([
        { $match: baseMatch },
        { $group: { _id: { $hour: { date: '$createdAt', timezone } }, orders: { $sum: 1 } } },
      ]).exec() as Promise<AggregateHourRow[]>,
      Order.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } },
            revenue: { $sum: '$totalMinor' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).exec() as Promise<AggregateDailyRow[]>,
    ]);

  const totalsRow = normalizeTotal(totals[0]);
  const prevTotalsRow = normalizeTotal(prevTotals[0]);
  const aov = totalsRow.orders > 0 ? totalsRow.revenue / totalsRow.orders : 0;
  const prevAov = prevTotalsRow.orders > 0 ? prevTotalsRow.revenue / prevTotalsRow.orders : 0;
  const apiKeyNameById = new Map<string, string>(
    apiKeys.map((key) => [String(key._id), key.name ?? 'Unnamed key']),
  );
  const channelRows = buildChannelRows(byChannel, byApiKey, apiKeyNameById);
  const dailySeries = buildDailySeries(dailyBuckets, days, timezone);
  const peakHours = buildPeakHours(hourlyBuckets);
  const topItemRows = topItems.map((item) => ({
    name: item.name?.trim() || 'Unnamed item',
    quantity: toCount(item.quantity),
    revenue: toMinor(item.revenue),
  }));

  return {
    days,
    channel,
    channelOptions,
    restaurantSlug,
    currency,
    locale,
    totalsRow,
    prevTotalsRow,
    aov,
    prevAov,
    revDelta: deltaPct(totalsRow.revenue, prevTotalsRow.revenue),
    ordDelta: deltaPct(totalsRow.orders, prevTotalsRow.orders),
    aovDelta: deltaPct(aov, prevAov),
    channelRows,
    topItems: topItemRows,
    dailySeries,
    peakHours,
    peakMax: peakHours.reduce((max, hour) => Math.max(max, hour.orders), 0),
    topMax: topItemRows.reduce((max, item) => Math.max(max, item.revenue), 0),
  };
}

function normalizeDays(value: string | undefined): number {
  return Math.max(1, Math.min(365, Number(value ?? '30') || 30));
}

function buildChannelOptions(apiKeys: ApiKeyOptionSource[]): AnalyticsFilterOption[] {
  return [
    ...CORE_CHANNEL_OPTIONS,
    ...apiKeys.map((key) => ({
      id: `api:${String(key._id)}`,
      label: `API · ${key.name ?? 'Unnamed key'}`,
    })),
  ];
}

function normalizeChannel(value: string | undefined, options: AnalyticsFilterOption[]): string {
  const channel = value ?? 'all';
  return options.some((option) => option.id === channel) ? channel : 'all';
}

function buildOrderMatch({
  restaurantId,
  since,
  until,
  channel,
  apiKeyFilter,
}: {
  restaurantId: Types.ObjectId;
  since: Date;
  until?: Date;
  channel: string;
  apiKeyFilter: Types.ObjectId | null;
}): Record<string, unknown> {
  const match: Record<string, unknown> = {
    restaurantId,
    createdAt: until ? { $gte: since, $lt: until } : { $gte: since },
    status: { $nin: EXCLUDED_REVENUE_ORDER_STATUSES },
    'payment.status': { $in: REVENUE_PAYMENT_STATUSES },
    totalMinor: { $gt: 0 },
  };

  if (channel === 'api') {
    match.channel = 'api';
  } else if (channel.startsWith('api:')) {
    match.channel = 'api';
    if (apiKeyFilter) match.apiKeyId = apiKeyFilter;
  } else if (channel !== 'all') {
    match.channel = channel;
  }

  return match;
}

function buildApiKeyMatch(
  baseMatch: Record<string, unknown>,
  apiKeyFilter: Types.ObjectId | null,
): Record<string, unknown> {
  const match: Record<string, unknown> = { ...baseMatch, channel: 'api' };
  if (apiKeyFilter) match.apiKeyId = apiKeyFilter;
  return match;
}

function normalizeTotal(row: AggregateTotalRow | undefined): AnalyticsTotalRow {
  return {
    revenue: toMinor(row?.revenue),
    orders: toCount(row?.orders),
  };
}

function buildChannelRows(
  byChannel: AggregateChannelRow[],
  byApiKey: AggregateApiKeyRow[],
  apiKeyNameById: Map<string, string>,
): AnalyticsChannelRow[] {
  const rows: AnalyticsChannelRow[] = [];

  for (const row of byChannel) {
    if (row._id === 'api') {
      if (byApiKey.length === 0) {
        rows.push({
          id: 'api',
          label: 'API',
          revenue: toMinor(row.revenue),
          orders: toCount(row.orders),
        });
        continue;
      }

      for (const keyRow of byApiKey) {
        const id = keyRow._id ? `api:${String(keyRow._id)}` : 'api:unassigned';
        const name = keyRow._id
          ? (apiKeyNameById.get(String(keyRow._id)) ?? 'Deleted key')
          : 'Unassigned API';
        rows.push({
          id,
          label: `API · ${name}`,
          revenue: toMinor(keyRow.revenue),
          orders: toCount(keyRow.orders),
        });
      }
      continue;
    }

    const channelId = row._id ?? 'unassigned';
    rows.push({
      id: channelId,
      label: formatChannelLabel(channelId),
      revenue: toMinor(row.revenue),
      orders: toCount(row.orders),
    });
  }

  return rows.sort((a, b) => b.revenue - a.revenue);
}

function buildDailySeries(
  buckets: AggregateDailyRow[],
  days: number,
  timezone: string,
): AnalyticsDailyRow[] {
  const bucketByDate = new Map(
    buckets.map((bucket) => [
      bucket._id,
      { revenue: toMinor(bucket.revenue), orders: toCount(bucket.orders) },
    ]),
  );
  const now = new Date();

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - (days - index - 1));
    const key = dateKeyForTimeZone(date, timezone);
    const bucket = bucketByDate.get(key);
    return {
      date: key,
      revenue: bucket?.revenue ?? 0,
      orders: bucket?.orders ?? 0,
    };
  });
}

function buildPeakHours(buckets: AggregateHourRow[]): AnalyticsPeakHour[] {
  const hourlyMap = new Map(
    buckets
      .filter(
        (bucket): bucket is AggregateHourRow & { _id: number } => typeof bucket._id === 'number',
      )
      .map((bucket) => [bucket._id, toCount(bucket.orders)]),
  );
  return Array.from({ length: 24 }, (_, hour) => ({ hour, orders: hourlyMap.get(hour) ?? 0 }));
}

function dateKeyForTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function deltaPct(current: number, prev: number): AnalyticsDelta {
  if (prev === 0) return { pct: 0, dir: 'flat' };
  const pct = ((current - prev) / prev) * 100;
  return { pct: Math.abs(pct), dir: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' };
}

function formatChannelLabel(channel: string): string {
  if (channel === 'qr_dinein') return 'QR dine-in';
  if (channel === 'walk_in') return 'Walk-in';
  return channel.replace(/_/g, ' ');
}

function toMinor(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : 0;
}

function toCount(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : 0;
}
