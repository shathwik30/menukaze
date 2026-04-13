'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkline } from './sparkline';

interface DataPoint {
  date: string;
  value: number;
}

interface Metrics {
  totalMerchants: number;
  activeMerchants: number;
  ordersToday: number;
  ordersThisWeek: number;
  ordersThisMonth: number;
  newSignupsWeek: number;
  newSignupsMonth: number;
  activeSessions: number;
  ordersPerDay: DataPoint[];
  signupsPerDay: DataPoint[];
}

function MetricCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number;
  subtitle?: string;
}) {
  return (
    <div className="border-border rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      {subtitle && <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>}
    </div>
  );
}

export function HealthDashboard({ metrics }: { metrics: Metrics }) {
  const router = useRouter();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Top-line metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="Active Merchants"
          value={metrics.activeMerchants}
          subtitle={`${metrics.totalMerchants} total`}
        />
        <MetricCard label="Orders Today" value={metrics.ordersToday} />
        <MetricCard label="Orders This Week" value={metrics.ordersThisWeek} />
        <MetricCard label="Orders This Month" value={metrics.ordersThisMonth} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="New Signups (7d)" value={metrics.newSignupsWeek} />
        <MetricCard label="New Signups (30d)" value={metrics.newSignupsMonth} />
        <MetricCard label="Active Sessions" value={metrics.activeSessions} />
      </div>

      {/* Sparkline charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="border-border rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">Orders (last 30 days)</h3>
          <Sparkline data={metrics.ordersPerDay} height={80} />
        </div>
        <div className="border-border rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">Signups (last 30 days)</h3>
          <Sparkline data={metrics.signupsPerDay} height={80} />
        </div>
      </div>
    </div>
  );
}
