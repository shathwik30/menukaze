'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import {
  channels,
  isTableStatusChangedEvent,
  isWaiterCalledEvent,
  isOrderStatusChangedEvent,
  isOrderCreatedEvent,
} from '@menukaze/realtime';
import { QRCodeSVG } from 'qrcode.react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@menukaze/ui';
import {
  createTableAction,
  updateTableAction,
  deleteTableAction,
  regenerateQrTokenAction,
  requestBillAction,
  getTableActiveOrdersAction,
  type TableSessionInfo,
} from '@/app/actions/tables-admin';
import { updateOrderStatusAction } from '@/app/actions/orders';
import { settleSessionAtCounterAction } from '@/app/actions/session-payments';
import { updateQrOrderingPausedAction } from '@/app/actions/settings';

export interface ManagerTable {
  id: string;
  number: number;
  name: string;
  capacity: number;
  zone?: string;
  qrToken: string;
  status: 'available' | 'occupied' | 'bill_requested' | 'paid' | 'needs_review';
  qrUrl: string;
  activeSessionId?: string;
  activeSessionCustomer?: string;
}

interface Props {
  restaurantId: string;
  tables: ManagerTable[];
  canEdit: boolean;
  canPrintQr: boolean;
  canProcessPayments: boolean;
  canToggleHoliday: boolean;
  canPauseQr: boolean;
  holidayModeEnabled: boolean;
  holidayModeMessage: string;
  qrOrderingPaused: boolean;
  downloadPdfUrl?: string;
}

const STATUS_CONFIG = {
  available: {
    label: 'Available',
    dot: 'bg-jade-500',
    text: 'text-jade-700',
    bg: 'bg-jade-50',
    border: 'border-jade-200',
  },
  occupied: {
    label: 'Occupied',
    dot: 'bg-saffron-500',
    text: 'text-saffron-800',
    bg: 'bg-saffron-50',
    border: 'border-saffron-200',
  },
  bill_requested: {
    label: 'Bill requested',
    dot: 'bg-lapis-500',
    text: 'text-lapis-700',
    bg: 'bg-lapis-50',
    border: 'border-lapis-200',
  },
  paid: {
    label: 'Paid – clearing',
    dot: 'bg-ink-400',
    text: 'text-ink-600',
    bg: 'bg-canvas-200',
    border: 'border-ink-200',
  },
  needs_review: {
    label: 'Needs review',
    dot: 'bg-mkrose-500',
    text: 'text-mkrose-700',
    bg: 'bg-mkrose-50',
    border: 'border-mkrose-200',
  },
} satisfies Record<
  ManagerTable['status'],
  { label: string; dot: string; text: string; bg: string; border: string }
>;

interface TableAlert {
  id: string;
  tableId: string;
  message: string;
  createdAt: string;
}

function formatMinutes(isoStart: string): string {
  const mins = Math.floor((Date.now() - new Date(isoStart).getTime()) / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatMoney(minor: number): string {
  return `₹${(minor / 100).toFixed(2)}`;
}

export function TablesManager({
  restaurantId,
  tables,
  canEdit,
  canPrintQr,
  canProcessPayments,
  canToggleHoliday: _canToggleHoliday,
  canPauseQr,
  holidayModeEnabled,
  holidayModeMessage,
  qrOrderingPaused,
  downloadPdfUrl,
}: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [rows, setRows] = useState(tables);
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<TableAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [holidayOpen] = useState(holidayModeEnabled);
  const [qrPaused, setQrPaused] = useState(qrOrderingPaused);
  const rowsRef = useRef(rows);

  useEffect(() => {
    setRows(tables);
  }, [tables]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const client = new Ably.Realtime({ authUrl: '/api/ably/token' });
    client.connection.on('connected', () => setConnected(true));
    client.connection.on('failed', () => setConnected(false));
    const channel = client.channels.get(channels.tables(restaurantId));

    const upsertAlert = (tableId: string, createdAt: string, message: string) => {
      setAlerts((prev) =>
        [{ id: `${tableId}:${createdAt}:${message}`, tableId, createdAt, message }, ...prev].slice(
          0,
          6,
        ),
      );
    };

    const handler = (message: Ably.Message) => {
      const payload: unknown = message.data;
      if (isTableStatusChangedEvent(payload)) {
        setRows((prev) =>
          prev.map((t) => (t.id === payload.tableId ? { ...t, status: payload.status } : t)),
        );
        if (payload.status === 'needs_review') {
          const name = rowsRef.current.find((t) => t.id === payload.tableId)?.name ?? 'Table';
          upsertAlert(
            payload.tableId,
            payload.changedAt,
            `${name} needs review. Payment is still outstanding.`,
          );
        }
      }
      if (isWaiterCalledEvent(payload)) {
        const name = rowsRef.current.find((t) => t.id === payload.tableId)?.name ?? 'Table';
        upsertAlert(
          payload.tableId,
          payload.calledAt,
          payload.reason === 'payment_help'
            ? `${name} requested payment assistance.`
            : `${name} called for a waiter.`,
        );
      }
    };

    void channel.subscribe(handler);
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId]);

  const selected = rows.find((t) => t.id === selectedId) ?? null;

  function run(
    fn: () => Promise<{ ok: true } | { ok: true; data: unknown } | { ok: false; error: string }>,
  ) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const updateTable = (
    t: ManagerTable,
    patch: { name?: string; capacity?: number; zone?: string },
  ) => run(() => updateTableAction({ id: t.id, ...patch }));

  const deleteTable = (t: ManagerTable) => {
    if (
      window.confirm(
        `Delete ${t.name}? This cannot be undone. Make sure the physical QR sticker is removed first.`,
      )
    ) {
      run(() => deleteTableAction(t.id));
      setSelectedId(null);
    }
  };

  const regenerateQr = (t: ManagerTable) => {
    if (window.confirm(`Regenerate the QR for ${t.name}? Existing stickers will stop resolving.`))
      run(() => regenerateQrTokenAction(t.id));
  };

  const settleAtCounter = (sessionId: string, method: 'cash' | 'terminal') =>
    run(() => settleSessionAtCounterAction({ sessionId, method }));

  const requestBill = (sessionId: string) => run(() => requestBillAction(sessionId));

  const toggleQrPaused = () => {
    const next = !qrPaused;
    setQrPaused(next);
    run(() => updateQrOrderingPausedAction(next));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Full-viewport backdrop tinted by connection state */}
      <div
        className="fixed inset-0 -z-10 transition-colors duration-700"
        style={{ backgroundColor: connected ? '#dcfce7' : '#fee2e2' }}
      />
      {/* Holiday mode banner (separate — affects all channels, set in Settings) */}
      {holidayOpen ? (
        <div className="bg-mkrose-50 border-mkrose-200 flex items-center justify-between gap-3 rounded-md border px-4 py-3">
          <p className="text-mkrose-800 text-xs font-semibold">
            Holiday mode is on — all ordering is paused.{' '}
            {holidayModeMessage ? holidayModeMessage : 'Manage this in Settings.'}
          </p>
        </div>
      ) : null}
      {/* QR ordering paused banner */}
      {qrPaused ? (
        <div className="bg-saffron-50 border-saffron-200 flex items-center justify-between gap-3 rounded-md border px-4 py-3">
          <p className="text-saffron-800 text-xs font-semibold">
            QR dine-in ordering is paused. Existing sessions are unaffected.
          </p>
          {canPauseQr ? (
            <Button
              size="xs"
              variant="outline"
              onClick={toggleQrPaused}
              disabled={isPending}
              className="border-mkrose-300 text-mkrose-700 hover:bg-mkrose-100 shrink-0"
            >
              Resume ordering
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: pause/resume QR ordering */}
        <div>
          {canPauseQr ? (
            <Button
              size="sm"
              variant="outline"
              onClick={toggleQrPaused}
              disabled={isPending}
              className={
                qrPaused
                  ? 'border-jade-200 text-jade-700 hover:bg-jade-50'
                  : 'border-saffron-200 text-saffron-700 hover:bg-saffron-50'
              }
            >
              {qrPaused ? 'Resume QR ordering' : 'Pause QR ordering'}
            </Button>
          ) : null}
        </div>

        {/* Right: live pill + download pdf + add table */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
              connected ? 'bg-jade-100 text-jade-700' : 'bg-mkrose-50 text-mkrose-600',
            )}
          >
            <span
              className={cn('size-1.5 rounded-full', connected ? 'bg-jade-500' : 'bg-mkrose-400')}
            />
            {connected ? 'Live' : 'Not connected'}
          </span>
          {downloadPdfUrl ? (
            <Link href={downloadPdfUrl}>
              <Button size="sm" variant="outline">
                Download PDF
              </Button>
            </Link>
          ) : null}
          {canEdit ? (
            <Button size="sm" onClick={() => setAddModalOpen(true)}>
              Add table
            </Button>
          ) : null}
        </div>
      </div>

      {/* Alert notifications */}
      {alerts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-saffron-50 border-saffron-200 flex items-start justify-between gap-3 rounded-md border px-3 py-2.5"
            >
              <div>
                <p className="text-saffron-800 text-xs font-semibold">{alert.message}</p>
                <p className="text-saffron-600 mt-0.5 font-mono text-[10px]">
                  {new Date(alert.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                className="text-saffron-700 shrink-0 text-xs font-medium underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="bg-mkrose-50 text-mkrose-700 rounded-md px-3 py-2.5 text-xs font-semibold"
        >
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="border-ink-200 bg-canvas-50 text-ink-500 rounded-md border border-dashed py-20 text-center text-sm">
          No tables yet.{' '}
          {canEdit ? (
            <button
              type="button"
              className="text-ink-700 font-medium underline underline-offset-2"
              onClick={() => setAddModalOpen(true)}
            >
              Add your first table.
            </button>
          ) : null}
        </div>
      ) : canEdit ? (
        <ManagerFloor
          tables={rows}
          selected={selected}
          canPrintQr={canPrintQr}
          pending={isPending}
          onSelect={(t) => setSelectedId(t.id === selectedId ? null : t.id)}
          onUpdate={updateTable}
          onDelete={deleteTable}
          onRegenerate={regenerateQr}
        />
      ) : (
        <WaiterFloor
          restaurantId={restaurantId}
          tables={rows}
          selectedId={selectedId}
          canProcessPayments={canProcessPayments}
          pending={isPending}
          onSelect={(t) => setSelectedId(t.id === selectedId ? null : t.id)}
          onClose={() => setSelectedId(null)}
          onRequestBill={requestBill}
          onSettleAtCounter={settleAtCounter}
        />
      )}

      {canEdit ? (
        <AddTableModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          nextNumber={(rows.at(-1)?.number ?? 0) + 1}
          existingZones={Array.from(
            new Set(rows.map((t) => t.zone?.trim() ?? 'Main floor').filter(Boolean)),
          )}
          onSubmit={(input) => {
            run(() => createTableAction(input));
            setAddModalOpen(false);
          }}
          pending={isPending}
        />
      ) : null}
    </div>
  );
}

// ─── Manager floor ────────────────────────────────────────────────────────────

function ManagerFloor({
  tables,
  selected,
  canPrintQr,
  pending,
  onSelect,
  onUpdate,
  onDelete,
  onRegenerate,
}: {
  tables: ManagerTable[];
  selected: ManagerTable | null;
  canPrintQr: boolean;
  pending: boolean;
  onSelect: (t: ManagerTable) => void;
  onUpdate: (t: ManagerTable, patch: { name?: string; capacity?: number; zone?: string }) => void;
  onDelete: (t: ManagerTable) => void;
  onRegenerate: (t: ManagerTable) => void;
}) {
  const zones = useMemo(() => {
    const map = new Map<string, ManagerTable[]>();
    for (const t of tables) {
      const zone = t.zone?.trim() ?? 'Main floor';
      map.set(zone, [...(map.get(zone) ?? []), t]);
    }
    return Array.from(map.entries()).map(([zone, rows]) => ({ zone, rows }));
  }, [tables]);

  return (
    <div
      className={cn('grid items-start gap-4', selected ? 'grid-cols-[1fr_340px]' : 'grid-cols-1')}
    >
      <section className="border-border relative min-h-[520px] overflow-hidden rounded-md border bg-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: 'radial-gradient(var(--mk-ink-200) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative flex flex-col gap-6 p-5">
          {zones.map(({ zone, rows }) => {
            const availableCount = rows.filter((t) => t.status === 'available').length;
            return (
              <div key={zone}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-ink-400 text-[10px] font-bold tracking-[0.18em] uppercase">
                    {zone}
                  </p>
                  {availableCount > 0 ? (
                    <span className="bg-jade-100 text-jade-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                      {availableCount} available
                    </span>
                  ) : null}
                </div>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}
                >
                  {rows.map((table) => (
                    <TableTile
                      key={table.id}
                      table={table}
                      selected={table.id === selected?.id}
                      onSelect={() => onSelect(table)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selected ? (
        <ManagerTableDetail
          table={selected}
          canPrintQr={canPrintQr}
          pending={pending}
          onUpdate={(patch) => onUpdate(selected, patch)}
          onDelete={() => onDelete(selected)}
          onRegenerate={() => onRegenerate(selected)}
          onClose={() => onSelect(selected)}
        />
      ) : null}
    </div>
  );
}

// ─── Waiter floor ─────────────────────────────────────────────────────────────

function WaiterFloor({
  restaurantId,
  tables,
  selectedId,
  canProcessPayments,
  pending,
  onSelect,
  onClose,
  onRequestBill,
  onSettleAtCounter,
}: {
  restaurantId: string;
  tables: ManagerTable[];
  selectedId: string | null;
  canProcessPayments: boolean;
  pending: boolean;
  onSelect: (t: ManagerTable) => void;
  onClose: () => void;
  onRequestBill: (sessionId: string) => void;
  onSettleAtCounter: (sessionId: string, method: 'cash' | 'terminal') => void;
}) {
  const selected = tables.find((t) => t.id === selectedId) ?? null;

  const zones = useMemo(() => {
    const map = new Map<string, ManagerTable[]>();
    for (const t of tables) {
      const zone = t.zone?.trim() ?? 'Main floor';
      map.set(zone, [...(map.get(zone) ?? []), t]);
    }
    return Array.from(map.entries()).map(([zone, rows]) => ({ zone, rows }));
  }, [tables]);

  return (
    <>
      <section className="border-border relative min-h-[520px] overflow-hidden rounded-md border bg-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: 'radial-gradient(var(--mk-ink-200) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative flex flex-col gap-6 p-5">
          {zones.map(({ zone, rows }) => {
            const availableCount = rows.filter((t) => t.status === 'available').length;
            return (
              <div key={zone}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-ink-400 text-[10px] font-bold tracking-[0.18em] uppercase">
                    {zone}
                  </p>
                  {availableCount > 0 ? (
                    <span className="bg-jade-100 text-jade-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                      {availableCount} available
                    </span>
                  ) : null}
                </div>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
                >
                  {rows.map((table) => (
                    <TableTile
                      key={table.id}
                      table={table}
                      selected={table.id === selectedId}
                      large
                      onSelect={() => onSelect(table)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selected ? (
        <WaiterTableSheet
          restaurantId={restaurantId}
          table={selected}
          canProcessPayments={canProcessPayments}
          pending={pending}
          onClose={onClose}
          onRequestBill={onRequestBill}
          onSettleAtCounter={onSettleAtCounter}
        />
      ) : null}
    </>
  );
}

// ─── Table tile ───────────────────────────────────────────────────────────────

function TableTile({
  table,
  selected,
  onSelect,
  large = false,
}: {
  table: ManagerTable;
  selected: boolean;
  onSelect: () => void;
  large?: boolean;
}) {
  const cfg = STATUS_CONFIG[table.status];
  const round = table.capacity <= 2;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5 border transition-all',
        large ? 'min-h-[100px]' : 'min-h-[84px]',
        round ? 'aspect-square rounded-full' : 'rounded-md',
        cfg.bg,
        selected
          ? 'border-ink-950 ring-saffron-200 ring-2 ring-offset-1'
          : cn('hover:border-ink-300', cfg.border),
      )}
    >
      <span className={cn('absolute top-2 right-2 size-1.5 rounded-full', cfg.dot)} />
      <span className="text-ink-950 text-xs font-bold">{table.name}</span>
      <span className="text-ink-500 text-[10px]">{table.capacity}p</span>
      {table.activeSessionCustomer ? (
        <span className={cn('max-w-[88%] truncate text-[10px] font-medium', cfg.text)}>
          {table.activeSessionCustomer}
        </span>
      ) : null}
    </button>
  );
}

// ─── Manager table detail (sidebar) ───────────────────────────────────────────

function ManagerTableDetail({
  table,
  canPrintQr,
  pending,
  onUpdate,
  onDelete,
  onRegenerate,
  onClose,
}: {
  table: ManagerTable;
  canPrintQr: boolean;
  pending: boolean;
  onUpdate: (patch: { name?: string; capacity?: number; zone?: string }) => void;
  onDelete: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(table.name);
  const [capacity, setCapacity] = useState(String(table.capacity));
  const [zone, setZone] = useState(table.zone ?? '');
  const cfg = STATUS_CONFIG[table.status];

  useEffect(() => {
    setName(table.name);
    setCapacity(String(table.capacity));
    setZone(table.zone ?? '');
    setEditing(false);
  }, [table.id, table.name, table.capacity, table.zone]);

  return (
    <aside className="border-border sticky top-20 overflow-hidden rounded-md border bg-white">
      <div className="border-border border-b px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink-400 text-[10px] font-bold tracking-[0.16em] uppercase">
            {table.zone ?? 'Main floor'} · {table.capacity}p
          </span>
          <div className="flex items-center gap-2">
            <span className={cn('flex items-center gap-1.5 text-[11px] font-semibold', cfg.text)}>
              <span className={cn('size-1.5 rounded-full', cfg.dot)} />
              {cfg.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-ink-400 hover:text-ink-700 ml-1 text-sm leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <h3 className="text-ink-950 mt-1.5 font-serif text-2xl font-medium -tracking-tight">
          {table.name}
        </h3>
      </div>

      {canPrintQr && table.qrUrl ? (
        <div className="border-border flex gap-4 border-b px-5 py-4">
          <div className="border-border shrink-0 rounded-md border p-2">
            <QRCodeSVG value={table.qrUrl} size={96} level="M" />
          </div>
          <div className="min-w-0">
            <p className="text-ink-400 text-[10px] font-bold tracking-[0.16em] uppercase">
              Scan-to-order
            </p>
            <p className="text-ink-600 mt-1 font-mono text-[11px] leading-relaxed break-all">
              {table.qrUrl}
            </p>
            <div className="mt-2.5 flex gap-2">
              <Link href={`/admin/tables/${table.id}/print`} target="_blank">
                <Button size="xs" variant="outline">
                  Print
                </Button>
              </Link>
              <Button size="xs" variant="outline" onClick={onRegenerate} disabled={pending}>
                Regenerate
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="px-5 py-4">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onUpdate({
                name: name.trim() || undefined,
                capacity: Number.parseInt(capacity, 10) || table.capacity,
                zone: zone.trim() || undefined,
              });
              setEditing(false);
            }}
            className="flex flex-col gap-3"
          >
            <FormField label="Name">
              <Input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="Capacity">
              <Input
                type="number"
                min="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </FormField>
            <FormField label="Zone">
              <Input type="text" value={zone} onChange={(e) => setZone(e.target.value)} />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={pending}
              className="border-mkrose-200 text-mkrose-700 hover:bg-mkrose-50"
            >
              Delete
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Waiter table sheet ────────────────────────────────────────────────────────

function WaiterTableSheet({
  restaurantId,
  table,
  canProcessPayments,
  pending,
  onClose,
  onRequestBill,
  onSettleAtCounter,
}: {
  restaurantId: string;
  table: ManagerTable;
  canProcessPayments: boolean;
  pending: boolean;
  onClose: () => void;
  onRequestBill: (sessionId: string) => void;
  onSettleAtCounter: (sessionId: string, method: 'cash' | 'terminal') => void;
}) {
  const [sessionInfo, setSessionInfo] = useState<TableSessionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [servingOrderId, setServingOrderId] = useState<string | null>(null);
  const cfg = STATUS_CONFIG[table.status];

  // Initial load
  useEffect(() => {
    if (!table.activeSessionId) {
      setSessionInfo(null);
      return;
    }
    setLoading(true);
    void getTableActiveOrdersAction(table.id).then((result) => {
      setLoading(false);
      if (result.ok && result.data) setSessionInfo(result.data);
    });
  }, [table.id, table.activeSessionId]);

  // Ably: auto-refresh order statuses + new orders in real time
  useEffect(() => {
    if (!table.activeSessionId) return;
    const client = new Ably.Realtime({ authUrl: '/api/ably/token' });
    const channel = client.channels.get(channels.orders(restaurantId));
    const handler = (message: Ably.Message) => {
      const payload: unknown = message.data;
      if (isOrderStatusChangedEvent(payload)) {
        setSessionInfo((prev) =>
          prev
            ? {
                ...prev,
                orders: prev.orders.map((o) =>
                  o.id === payload.orderId ? { ...o, status: payload.status } : o,
                ),
              }
            : prev,
        );
      }
      // New round placed by the customer — reload the full session info
      if (isOrderCreatedEvent(payload)) {
        void getTableActiveOrdersAction(table.id).then((result) => {
          if (result.ok && result.data) setSessionInfo(result.data);
        });
      }
    };
    void channel.subscribe(handler);
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId, table.activeSessionId, table.id]);

  // All non-cancelled orders must be served/completed before bill can be requested
  const activeOrders = sessionInfo?.orders.filter((o) => o.status !== 'cancelled') ?? [];
  const allOrdersServed =
    activeOrders.length > 0 &&
    activeOrders.every((o) => o.status === 'served' || o.status === 'completed');

  const canSettle =
    canProcessPayments &&
    sessionInfo?.sessionId &&
    (table.status === 'bill_requested' || table.status === 'needs_review');

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-transparent"
        tabIndex={-1}
      />

      {/* Sheet */}
      <aside className="border-border fixed top-0 right-0 bottom-0 z-50 flex w-96 flex-col overflow-hidden border-l bg-white shadow-2xl">
        {/* Header */}
        <div className="border-border border-b px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-ink-400 text-[10px] font-bold tracking-[0.16em] uppercase">
                {table.zone ?? 'Main floor'} · {table.capacity}p
              </p>
              <h2 className="text-ink-950 mt-0.5 font-serif text-xl font-medium -tracking-tight">
                {table.name}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn('flex items-center gap-1.5 text-[11px] font-semibold', cfg.text)}>
                <span className={cn('size-1.5 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="text-ink-400 hover:text-ink-700 text-sm leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {sessionInfo ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-ink-700 text-sm font-semibold">{sessionInfo.customerName}</p>
              <p className="text-ink-400 font-mono text-xs">
                {formatMinutes(sessionInfo.startedAt)} seated
              </p>
            </div>
          ) : null}
        </div>

        {/* Orders */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-ink-400 text-sm">Loading…</span>
            </div>
          ) : !sessionInfo || sessionInfo.orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              {table.status === 'available' ? (
                <p className="text-ink-400 text-sm">Table is available.</p>
              ) : (
                <p className="text-ink-400 text-sm">No orders yet.</p>
              )}
            </div>
          ) : (
            <div className="divide-border divide-y">
              {sessionInfo.orders.map((order, i) => {
                const isReady = order.status === 'ready';
                const isServing = servingOrderId === order.id;
                const roundBg =
                  order.status === 'ready'
                    ? 'bg-jade-50'
                    : order.status === 'preparing'
                      ? 'bg-saffron-50'
                      : order.status === 'confirmed' || order.status === 'received'
                        ? 'bg-lapis-50'
                        : order.status === 'served' || order.status === 'completed'
                          ? 'bg-canvas-50'
                          : order.status === 'cancelled'
                            ? 'bg-mkrose-50'
                            : 'bg-white';
                return (
                  <div key={order.id} className={cn('px-5 py-3', roundBg)}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-ink-500 text-[10px] font-bold tracking-[0.14em] uppercase">
                          Round {i + 1}
                        </p>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="text-ink-400 font-mono text-[10px]">
                        {new Date(order.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {order.items.map((item, j) => (
                        <li key={j} className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-1.5">
                            <span className="text-ink-400 mt-px font-mono text-xs">
                              {item.quantity}×
                            </span>
                            <span className="text-ink-800 text-sm leading-snug">{item.name}</span>
                          </div>
                          <span className="text-ink-600 shrink-0 font-mono text-xs">
                            {formatMoney(item.lineTotalMinor)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {isReady ? (
                      <button
                        type="button"
                        disabled={isServing}
                        onClick={() => {
                          setServingOrderId(order.id);
                          void updateOrderStatusAction({
                            orderId: order.id,
                            nextStatus: 'served',
                          }).then((result) => {
                            setServingOrderId(null);
                            if (result.ok) {
                              setSessionInfo((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      orders: prev.orders.map((o) =>
                                        o.id === order.id ? { ...o, status: 'served' } : o,
                                      ),
                                    }
                                  : prev,
                              );
                            }
                          });
                        }}
                        className={cn(
                          'mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                          isServing
                            ? 'bg-canvas-100 text-ink-400'
                            : 'bg-jade-600 hover:bg-jade-700 text-white',
                        )}
                      >
                        <DishIcon className="size-3.5" />
                        {isServing ? 'Marking…' : 'Mark served'}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {sessionInfo ? (
          <div className="border-border border-t px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-ink-600 text-sm font-semibold">Total</p>
              <p className="text-ink-950 font-mono text-sm font-bold">
                {formatMoney(sessionInfo.grandTotalMinor)}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {/* Request bill: only when ALL non-cancelled orders are served/completed */}
              {allOrdersServed && table.status === 'occupied' && sessionInfo.sessionId ? (
                <Button
                  size="sm"
                  full
                  onClick={() => onRequestBill(sessionInfo.sessionId)}
                  disabled={pending}
                >
                  Request bill
                </Button>
              ) : null}
              {/* Show hint when orders exist but not all served yet */}
              {!allOrdersServed && table.status === 'occupied' && activeOrders.length > 0 ? (
                <p className="text-ink-400 text-center text-xs">
                  Mark all rounds as served to request the bill.
                </p>
              ) : null}
              {canSettle && sessionInfo.sessionId ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    full
                    onClick={() => onSettleAtCounter(sessionInfo.sessionId, 'cash')}
                    disabled={pending}
                  >
                    Settle cash
                  </Button>
                  <Button
                    size="sm"
                    full
                    variant="outline"
                    onClick={() => onSettleAtCounter(sessionInfo.sessionId, 'terminal')}
                    disabled={pending}
                  >
                    Terminal
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}

// ─── Add table modal ───────────────────────────────────────────────────────────

function AddTableModal({
  open,
  onClose,
  nextNumber,
  existingZones,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  nextNumber: number;
  existingZones: string[];
  onSubmit: (input: { number: number; name?: string; capacity: number; zone?: string }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [selectedZone, setSelectedZone] = useState('');
  const [newZone, setNewZone] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setCapacity('4');
      setSelectedZone('');
      setNewZone('');
    }
  }, [open]);

  // Resolved zone: new zone input takes priority over chip selection
  const resolvedZone = newZone.trim() || selectedZone;

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogHeader>
        <DialogTitle>Add table</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsedCapacity = Number.parseInt(capacity, 10) || 4;
          onSubmit({
            number: nextNumber,
            ...(name.trim() ? { name: name.trim() } : {}),
            capacity: parsedCapacity,
            zone: resolvedZone || 'Main floor',
          });
        }}
      >
        <DialogBody className="flex flex-col gap-4 pt-3">
          <FormField label="Table name">
            <Input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Table 7, Bar seat 2, Booth A"
              autoFocus
            />
          </FormField>
          <FormField label="Capacity">
            <Input
              type="number"
              min="1"
              max="99"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </FormField>
          <div className="flex flex-col gap-2">
            <Label>Zone</Label>
            {existingZones.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {existingZones.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => {
                      setSelectedZone(z === selectedZone ? '' : z);
                      setNewZone('');
                    }}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      selectedZone === z && !newZone.trim()
                        ? 'border-ink-950 bg-ink-950 text-white'
                        : 'border-ink-200 text-ink-600 hover:border-ink-400',
                    )}
                  >
                    {z}
                  </button>
                ))}
              </div>
            ) : null}
            <Input
              type="text"
              value={newZone}
              onChange={(e) => {
                setNewZone(e.target.value);
                if (e.target.value.trim()) setSelectedZone('');
              }}
              placeholder={
                existingZones.length > 0 ? 'Or type a new zone name…' : 'e.g. Patio, Rooftop, Bar'
              }
              maxLength={60}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            Add table
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

const ORDER_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  received: { label: 'Received', className: 'bg-canvas-100 text-ink-500' },
  confirmed: { label: 'In queue', className: 'bg-canvas-100 text-ink-500' },
  preparing: { label: 'Preparing', className: 'bg-saffron-100 text-saffron-700' },
  ready: { label: 'Ready', className: 'bg-jade-100 text-jade-700 animate-pulse' },
  served: { label: 'Served', className: 'bg-jade-100 text-jade-700' },
  out_for_delivery: { label: 'On the way', className: 'bg-lapis-100 text-lapis-700' },
  delivered: { label: 'Delivered', className: 'bg-jade-100 text-jade-700' },
  completed: { label: 'Completed', className: 'bg-canvas-100 text-ink-400' },
  cancelled: { label: 'Cancelled', className: 'bg-mkrose-50 text-mkrose-600' },
};

function OrderStatusBadge({ status }: { status: string }) {
  const cfg = ORDER_STATUS_BADGE[status] ?? {
    label: status,
    className: 'bg-canvas-100 text-ink-500',
  };
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase',
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

function DishIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  );
}
