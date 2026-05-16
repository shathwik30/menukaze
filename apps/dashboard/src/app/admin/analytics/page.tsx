import { formatMoney } from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';
import Link from 'next/link';
import { AnalyticsFilters } from './analytics-filters';
import { RANGE_OPTIONS, loadAnalyticsData } from './analytics-data';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ days?: string; channel?: string }>;
}

const CHANNEL_COLORS: Record<string, string> = {
  qr_dinein: 'var(--mk-jade-500)',
  storefront: 'var(--mk-lapis-500)',
  kiosk: 'var(--mk-saffron-500)',
  walk_in: 'var(--mk-ink-400)',
  api: 'var(--mk-rose-400)',
};

function getChannelColor(id: string): string {
  if (id.startsWith('api:')) return 'var(--mk-rose-400)';
  return CHANNEL_COLORS[id] ?? 'var(--mk-ink-300)';
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const { restaurantId } = await requirePageFlag(['analytics.view']);
  const params = await searchParams;
  const {
    days,
    channel,
    channelOptions,
    currency,
    locale,
    totalsRow,
    revDelta,
    ordDelta,
    aovDelta,
    aov,
    channelRows,
    topItems,
    dailySeries,
    peakHours,
    peakMax,
    topMax,
  } = await loadAnalyticsData(restaurantId, params);

  // Daily sparklines for stats
  const dailyRevenue = dailySeries.map((d) => d.revenue);
  const dailyOrders = dailySeries.map((d) => d.orders);
  const dailyAov = dailySeries.map((d) => (d.orders > 0 ? Math.round(d.revenue / d.orders) : 0));
  const revenueSparkline = dailyRevenue.some((v) => v > 0) ? dailyRevenue : [];
  const ordersSparkline = dailyOrders.some((v) => v > 0) ? dailyOrders : [];
  const aovSparkline = dailyAov.some((v) => v > 0) ? dailyAov : [];

  // SVG sparkline helper
  function sparklinePath(data: number[], w = 80, h = 28): string {
    if (data.length < 2) return '';
    const max = Math.max(...data, 1);
    const step = w / (data.length - 1);
    return data
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - (v / max) * (h - 4) - 2}`)
      .join(' ');
  }
  function areaPath(data: number[], w = 80, h = 28): string {
    if (data.length < 2) return '';
    const max = Math.max(...data, 1);
    const step = w / (data.length - 1);
    const line = data
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - (v / max) * (h - 4) - 2}`)
      .join(' ');
    return `${line} L ${(data.length - 1) * step} ${h} L 0 ${h} Z`;
  }

  // Revenue area chart (big)
  const chartData = dailySeries.slice(-Math.min(days, 60));
  const hasChartData = chartData.some((d) => d.revenue > 0);
  const chartMax = Math.max(...chartData.map((d) => d.revenue), 1);
  const W = 1000,
    H = 200;
  const cStep = chartData.length > 1 ? W / (chartData.length - 1) : W;
  const toY = (v: number) => H - (v / chartMax) * (H - 24) - 12;
  const chartLine = chartData
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${i * cStep} ${toY(d.revenue)}`)
    .join(' ');
  const chartArea = `${chartLine} L ${(chartData.length - 1) * cStep} ${H} L 0 ${H} Z`;

  // Channel total for donut
  const channelTotal = channelRows.reduce((s, r) => s + r.revenue, 0) || 1;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          padding: '28px 40px 24px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--mk-saffron-700)',
              marginBottom: 8,
            }}
          >
            Overview
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--mk-ink-950)',
            }}
          >
            Analytics
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)' }}>
            The numbers that matter — revenue, channel mix, item performance and peak hours.
          </p>
        </div>
        <AnalyticsFilters
          days={days}
          channel={channel}
          rangeOptions={RANGE_OPTIONS}
          channelOptions={channelOptions}
        />
      </div>

      <div style={{ padding: '24px 40px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[
            {
              label: 'Paid revenue',
              value: formatMoney(totalsRow.revenue, currency, locale),
              delta: revDelta,
              accent: 'var(--mk-saffron-500)',
              sparkData: revenueSparkline,
            },
            {
              label: 'Paid orders',
              value: String(totalsRow.orders),
              delta: ordDelta,
              accent: 'var(--mk-jade-500)',
              sparkData: ordersSparkline,
            },
            {
              label: 'Avg ticket',
              value: formatMoney(Math.round(aov), currency, locale),
              delta: aovDelta,
              accent: 'var(--mk-lapis-500)',
              sparkData: aovSparkline,
            },
            {
              label: 'Channels active',
              value: String(channelRows.length),
              delta: null,
              accent: 'var(--mk-rose-500)',
              sparkData: [],
            },
          ].map((s) => {
            const sp = sparklinePath(s.sparkData);
            const ap = areaPath(s.sparkData);
            return (
              <div
                key={s.label}
                style={{
                  background: 'white',
                  border: '1px solid var(--mk-ink-100)',
                  borderRadius: 14,
                  padding: '18px 20px',
                  boxShadow: 'var(--shadow-xs)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--mk-ink-500)',
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: 28,
                        fontWeight: 500,
                        letterSpacing: '-0.02em',
                        color: 'var(--mk-ink-950)',
                        lineHeight: 1,
                      }}
                    >
                      {s.value}
                    </div>
                    {s.delta ? (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          color:
                            s.delta.dir === 'up'
                              ? 'var(--mk-jade-700)'
                              : s.delta.dir === 'down'
                                ? 'var(--mk-rose-700)'
                                : 'var(--mk-ink-500)',
                        }}
                      >
                        {s.delta.dir === 'up' ? '↑' : s.delta.dir === 'down' ? '↓' : '→'}{' '}
                        {s.delta.pct.toFixed(1)}% vs prev
                      </div>
                    ) : (
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--mk-ink-400)' }}>
                        this period
                      </div>
                    )}
                  </div>
                  {sp ? (
                    <svg viewBox="0 0 80 28" style={{ width: 80, height: 28, flexShrink: 0 }}>
                      <defs>
                        <linearGradient id={`spg-${s.label}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={s.accent} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={s.accent} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={ap} fill={`url(#spg-${s.label})`} />
                      <path
                        d={sp}
                        fill="none"
                        stroke={s.accent}
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: s.accent,
                        marginBottom: 6,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Revenue area chart */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--mk-ink-100)',
            borderRadius: 14,
            padding: '20px 24px',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mk-ink-950)' }}>
                Revenue trend
              </div>
              <div style={{ fontSize: 12, color: 'var(--mk-ink-400)', marginTop: 2 }}>
                Net revenue over the last {days} day{days !== 1 ? 's' : ''}.
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                fontSize: 11.5,
                color: 'var(--mk-ink-500)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 18,
                    height: 0,
                    borderTop: '2px solid var(--mk-ink-950)',
                  }}
                />
                Revenue
              </span>
            </div>
          </div>
          {chartData.length > 1 && hasChartData ? (
            <div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                style={{ width: '100%', height: 200 }}
              >
                <defs>
                  <linearGradient id="big-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--mk-saffron-400)" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="var(--mk-saffron-400)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75, 1].map((p) => (
                  <line
                    key={p}
                    x1="0"
                    y1={p * (H - 24) + 12}
                    x2={W}
                    y2={p * (H - 24) + 12}
                    stroke="var(--mk-ink-100)"
                    strokeDasharray="2 6"
                  />
                ))}
                <path d={chartArea} fill="url(#big-grad)" />
                <path
                  d={chartLine}
                  fill="none"
                  stroke="var(--mk-saffron-500)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10.5,
                  color: 'var(--mk-ink-400)',
                  marginTop: 8,
                }}
              >
                {chartData.length > 0 &&
                  [
                    chartData[0]?.date,
                    chartData[Math.floor(chartData.length * 0.25)]?.date,
                    chartData[Math.floor(chartData.length * 0.5)]?.date,
                    chartData[Math.floor(chartData.length * 0.75)]?.date,
                    chartData[chartData.length - 1]?.date,
                  ]
                    .filter(Boolean)
                    .map((d) => <span key={d as string}>{d as string}</span>)}
              </div>
            </div>
          ) : (
            <div
              style={{
                height: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--mk-ink-400)',
                fontSize: 13,
              }}
            >
              No paid order data for this range yet.
            </div>
          )}
        </div>

        {/* Channel mix + Peak hours */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Channel mix */}
          <div
            style={{
              background: 'white',
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 14,
              padding: '20px 24px',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <div
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--mk-ink-950)', marginBottom: 4 }}
            >
              Channel mix
            </div>
            <div style={{ fontSize: 12, color: 'var(--mk-ink-400)', marginBottom: 18 }}>
              Where orders originated, by revenue share.
            </div>
            {channelRows.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 0',
                  fontSize: 13.5,
                  color: 'var(--mk-ink-400)',
                }}
              >
                No orders in range
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                {/* Donut */}
                <svg width={160} height={160} viewBox="0 0 180 180" style={{ flexShrink: 0 }}>
                  {(() => {
                    const r = 60,
                      cx = 90,
                      cy = 90,
                      C = 2 * Math.PI * r;
                    let offset = 0;
                    return channelRows.map((row) => {
                      const share = row.revenue / channelTotal;
                      const len = share * C;
                      const dasharray = `${len} ${C - len}`;
                      const dashoffset = -offset;
                      offset += len;
                      return (
                        <circle
                          key={row.id}
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill="none"
                          stroke={getChannelColor(row.id)}
                          strokeWidth="22"
                          strokeDasharray={dasharray}
                          strokeDashoffset={dashoffset}
                          transform={`rotate(-90 ${cx} ${cy})`}
                        />
                      );
                    });
                  })()}
                  <text
                    x="90"
                    y="86"
                    textAnchor="middle"
                    fontFamily="var(--font-serif)"
                    fontSize="18"
                    fontWeight="500"
                    fill="var(--mk-ink-950)"
                  >
                    {channelRows.length}
                  </text>
                  <text
                    x="90"
                    y="102"
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--mk-ink-500)"
                    fontWeight="600"
                    style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}
                  >
                    channels
                  </text>
                </svg>
                {/* Legend */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {channelRows.slice(0, 5).map((row) => {
                    const pct = Math.round((row.revenue / channelTotal) * 100);
                    return (
                      <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: getChannelColor(row.id),
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            fontSize: 12.5,
                            textTransform: 'capitalize',
                            color: 'var(--mk-ink-700)',
                          }}
                        >
                          {row.label}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'var(--mk-ink-500)',
                          }}
                        >
                          {formatMoney(row.revenue, currency, locale)}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            fontWeight: 600,
                            width: 36,
                            textAlign: 'right',
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Peak hours */}
          <div
            style={{
              background: 'white',
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 14,
              padding: '20px 24px',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <div
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--mk-ink-950)', marginBottom: 4 }}
            >
              Peak hours
            </div>
            <div style={{ fontSize: 12, color: 'var(--mk-ink-400)', marginBottom: 18 }}>
              Order volume by hour of day — darker = busier.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
              {peakHours.map((h) => {
                const intensity = peakMax > 0 ? h.orders / peakMax : 0;
                const bg =
                  intensity === 0
                    ? 'var(--mk-canvas-100)'
                    : `oklch(${0.88 - intensity * 0.4} ${0.08 + intensity * 0.1} ${68 - intensity * 15})`;
                const color = intensity > 0.5 ? 'white' : 'var(--mk-ink-500)';
                return (
                  <div
                    key={h.hour}
                    title={`${String(h.hour).padStart(2, '0')}:00 — ${h.orders} order${h.orders !== 1 ? 's' : ''}`}
                    style={{
                      height: 48,
                      borderRadius: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: bg,
                      color,
                      fontSize: 10,
                      fontWeight: 500,
                      cursor: 'default',
                      transition: 'transform 150ms',
                    }}
                  >
                    {h.hour}
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 12,
                fontSize: 11,
                color: 'var(--mk-ink-400)',
              }}
            >
              <span>Less</span>
              <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                {[0.1, 0.3, 0.5, 0.7, 0.95].map((intensity) => (
                  <span
                    key={intensity}
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 2,
                      background: `oklch(${0.88 - intensity * 0.4} ${0.08 + intensity * 0.1} ${68 - intensity * 15})`,
                    }}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
        </div>

        {/* Top items table */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--mk-ink-100)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--mk-ink-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mk-ink-950)' }}>
                Items ranked
              </div>
              <div style={{ fontSize: 12, color: 'var(--mk-ink-400)', marginTop: 2 }}>
                Revenue contribution, last {days} day{days !== 1 ? 's' : ''}.
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 99,
                background: 'var(--mk-canvas-100)',
                color: 'var(--mk-ink-600)',
              }}
            >
              By revenue
            </span>
          </div>
          {topItems.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                fontSize: 13.5,
                color: 'var(--mk-ink-400)',
              }}
            >
              Nothing sold in this range yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--mk-canvas-50)' }}>
                  {['#', 'Item', 'Qty sold', 'Revenue', '% of total'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign: i >= 2 ? 'right' : 'left',
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'var(--mk-ink-500)',
                        borderBottom: '1px solid var(--mk-ink-100)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topItems.map((row, i) => {
                  const pct = topMax > 0 ? Math.round((row.revenue / topMax) * 100) : 0;
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--mk-ink-100)', position: 'relative' }}
                    >
                      <td
                        style={{
                          padding: '12px 16px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: 'var(--mk-ink-400)',
                          width: 40,
                        }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: 14.5,
                            fontWeight: 500,
                            color: 'var(--mk-ink-950)',
                          }}
                        >
                          {row.name}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          color: 'var(--mk-ink-600)',
                        }}
                      >
                        {row.quantity}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--mk-ink-950)',
                        }}
                      >
                        {formatMoney(row.revenue, currency, locale)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            justifyContent: 'flex-end',
                          }}
                        >
                          <div
                            style={{
                              width: 80,
                              height: 6,
                              borderRadius: 99,
                              background: 'var(--mk-canvas-100)',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: 'var(--mk-saffron-400)',
                                borderRadius: 99,
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11.5,
                              color: 'var(--mk-ink-500)',
                              width: 36,
                              textAlign: 'right',
                            }}
                          >
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Export link */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Link
            href={`/admin/analytics/export?days=${days}&channel=${encodeURIComponent(channel)}`}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--mk-ink-500)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Export CSV
          </Link>
        </div>
      </div>
    </div>
  );
}
