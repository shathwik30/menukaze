'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import { channels, isTableStatusChangedEvent, isWaiterCalledEvent } from '@menukaze/realtime';
import { QRCodeSVG } from 'qrcode.react';
import {
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@menukaze/ui';
import {
  createTableAction,
  updateTableAction,
  deleteTableAction,
  regenerateQrTokenAction,
} from '@/app/actions/tables-admin';
import { settleSessionAtCounterAction } from '@/app/actions/session-payments';

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
}

type TableView = 'floor' | 'list' | 'qr';

const TABLE_VIEWS: Array<{ value: TableView; label: string }> = [
  { value: 'floor', label: 'Floor plan' },
  { value: 'list', label: 'List' },
  { value: 'qr', label: 'QR codes' },
];

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

export function TablesManager({
  restaurantId,
  tables,
  canEdit,
  canPrintQr,
  canProcessPayments,
}: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [rows, setRows] = useState(tables);
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<TableAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TableView>('floor');
  const [selectedId, setSelectedId] = useState<string | null>(tables[0]?.id ?? null);
  const rowsRef = useRef(rows);

  useEffect(() => {
    setRows(tables);
    setSelectedId((c) => c ?? tables[0]?.id ?? null);
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

  const selected = rows.find((t) => t.id === selectedId) ?? rows[0] ?? null;

  const countsByStatus = useMemo(() => {
    const counts = new Map<ManagerTable['status'], number>();
    for (const t of rows) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
    return counts;
  }, [rows]);

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
    )
      run(() => deleteTableAction(t.id));
  };

  const regenerateQr = (t: ManagerTable) => {
    if (window.confirm(`Regenerate the QR for ${t.name}? Existing stickers will stop resolving.`))
      run(() => regenerateQrTokenAction(t.id));
  };

  const settleAtCounter = (t: ManagerTable, method: 'cash' | 'terminal') =>
    run(() => settleSessionAtCounterAction({ sessionId: t.activeSessionId, method }));

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <CreateTableForm
          nextNumber={(rows.at(-1)?.number ?? 0) + 1}
          onSubmit={(input) => run(() => createTableAction(input))}
          pending={isPending}
        />
      ) : null}

      {/* Live sync + alerts */}
      <div className="border-border rounded-md border bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="text-ink-600 flex items-center gap-2 text-xs">
            <span className={cn('size-2 rounded-full', connected ? 'bg-jade-500' : 'bg-ink-300')} />
            {connected ? 'Live sync active' : 'Connecting...'}
          </div>
          {alerts.length > 0 ? (
            <button
              type="button"
              onClick={() => setAlerts([])}
              className="text-ink-500 text-xs font-medium underline underline-offset-2"
            >
              Clear all
            </button>
          ) : null}
        </div>
        {alerts.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="bg-saffron-50 flex items-start justify-between gap-3 rounded-md px-3 py-2.5"
              >
                <div>
                  <p className="text-saffron-800 text-xs font-semibold">{alert.message}</p>
                  <p className="text-saffron-600 mt-0.5 font-mono text-[10px]">
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                  className="text-saffron-700 shrink-0 text-xs font-medium underline underline-offset-2"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="bg-mkrose-50 text-mkrose-700 rounded-md px-3 py-2.5 text-xs font-semibold"
        >
          {error}
        </p>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="border-border bg-canvas-100 inline-flex gap-0.5 rounded-md border p-1">
          {TABLE_VIEWS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={cn(
                'h-7 rounded px-3 text-xs font-semibold transition-colors',
                view === value
                  ? 'text-ink-950 bg-white shadow-xs'
                  : 'text-ink-500 hover:text-ink-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-4">
          {(
            Object.entries(STATUS_CONFIG) as Array<
              [ManagerTable['status'], (typeof STATUS_CONFIG)[ManagerTable['status']]]
            >
          ).map(([status, cfg]) => (
            <div key={status} className="text-ink-600 flex items-center gap-1.5 text-xs">
              <span className={cn('size-2 rounded-full', cfg.dot)} />
              {cfg.label}
              <span className="text-ink-400 font-mono">{countsByStatus.get(status) ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border-ink-200 bg-canvas-50 text-ink-500 rounded-md border border-dashed py-16 text-center text-sm">
          No tables yet.
        </div>
      ) : view === 'floor' ? (
        <FloorPlan
          tables={rows}
          selected={selected}
          onSelect={(t) => setSelectedId(t.id)}
          canEdit={canEdit}
          canPrintQr={canPrintQr}
          canProcessPayments={canProcessPayments}
          pending={isPending}
          onUpdate={updateTable}
          onDelete={deleteTable}
          onRegenerate={regenerateQr}
          onSettleAtCounter={settleAtCounter}
        />
      ) : view === 'list' ? (
        <TableList
          tables={rows}
          canPrintQr={canPrintQr}
          onSelect={(t) => {
            setSelectedId(t.id);
            setView('floor');
          }}
        />
      ) : (
        <QRGallery tables={rows} canPrintQr={canPrintQr} />
      )}
    </div>
  );
}

function CreateTableForm({
  nextNumber,
  onSubmit,
  pending,
}: {
  nextNumber: number;
  onSubmit: (input: { number: number; name?: string; capacity: number; zone?: string }) => void;
  pending: boolean;
}) {
  const [number, setNumber] = useState(String(nextNumber));
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [zone, setZone] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const parsedNumber = Number.parseInt(number, 10);
        const parsedCapacity = Number.parseInt(capacity, 10) || 4;
        if (!Number.isFinite(parsedNumber) || parsedNumber < 1) return;
        onSubmit({
          number: parsedNumber,
          ...(name.trim() ? { name: name.trim() } : {}),
          capacity: parsedCapacity,
          ...(zone.trim() ? { zone: zone.trim() } : {}),
        });
        setNumber(String(parsedNumber + 1));
        setName('');
        setZone('');
      }}
      className="border-ink-200 bg-canvas-50 grid items-end gap-2 rounded-md border border-dashed p-3"
      style={{ gridTemplateColumns: '80px 1fr 80px 1fr auto' }}
    >
      <FormField label="No.">
        <Input type="number" min="1" value={number} onChange={(e) => setNumber(e.target.value)} />
      </FormField>
      <FormField label="Name">
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Table ${number}`}
        />
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
        <Input
          type="text"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder="Patio"
        />
      </FormField>
      <Button type="submit" size="sm" disabled={pending}>
        Add table
      </Button>
    </form>
  );
}

function FloorPlan({
  tables,
  selected,
  onSelect,
  canEdit,
  canPrintQr,
  canProcessPayments,
  pending,
  onUpdate,
  onDelete,
  onRegenerate,
  onSettleAtCounter,
}: {
  tables: ManagerTable[];
  selected: ManagerTable | null;
  onSelect: (t: ManagerTable) => void;
  canEdit: boolean;
  canPrintQr: boolean;
  canProcessPayments: boolean;
  pending: boolean;
  onUpdate: (t: ManagerTable, patch: { name?: string; capacity?: number; zone?: string }) => void;
  onDelete: (t: ManagerTable) => void;
  onRegenerate: (t: ManagerTable) => void;
  onSettleAtCounter: (t: ManagerTable, method: 'cash' | 'terminal') => void;
}) {
  const zones = useMemo(() => {
    const map = new Map<string, ManagerTable[]>();
    for (const t of tables) {
      const zone = t.zone?.trim() || 'Main floor';
      map.set(zone, [...(map.get(zone) ?? []), t]);
    }
    return Array.from(map.entries()).map(([zone, rows]) => ({ zone, rows }));
  }, [tables]);

  return (
    <div
      className={cn('grid items-start gap-4', selected ? 'grid-cols-[1fr_340px]' : 'grid-cols-1')}
    >
      {/* Floor grid */}
      <section className="border-border relative min-h-[520px] overflow-hidden rounded-md border bg-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: 'radial-gradient(var(--mk-ink-200) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative flex flex-col gap-5 p-5">
          {zones.map(({ zone, rows }) => (
            <div key={zone}>
              <p className="text-ink-400 mb-2.5 text-[10px] font-bold tracking-[0.18em] uppercase">
                {zone}
              </p>
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
          ))}
        </div>
      </section>

      {selected ? (
        <TableDetail
          table={selected}
          canEdit={canEdit}
          canPrintQr={canPrintQr}
          canProcessPayments={canProcessPayments}
          pending={pending}
          onUpdate={(patch) => onUpdate(selected, patch)}
          onDelete={() => onDelete(selected)}
          onRegenerate={() => onRegenerate(selected)}
          onSettleAtCounter={(method) => onSettleAtCounter(selected, method)}
        />
      ) : null}
    </div>
  );
}

function TableTile({
  table,
  selected,
  onSelect,
}: {
  table: ManagerTable;
  selected: boolean;
  onSelect: () => void;
}) {
  const cfg = STATUS_CONFIG[table.status];
  const round = table.capacity <= 2;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex min-h-[84px] flex-col items-center justify-center gap-0.5 border transition-all',
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

function TableDetail({
  table,
  canEdit,
  canPrintQr,
  canProcessPayments,
  pending,
  onUpdate,
  onDelete,
  onRegenerate,
  onSettleAtCounter,
}: {
  table: ManagerTable;
  canEdit: boolean;
  canPrintQr: boolean;
  canProcessPayments: boolean;
  pending: boolean;
  onUpdate: (patch: { name?: string; capacity?: number; zone?: string }) => void;
  onDelete: () => void;
  onRegenerate: () => void;
  onSettleAtCounter: (method: 'cash' | 'terminal') => void;
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
      {/* Header */}
      <div className="border-border border-b px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink-400 text-[10px] font-bold tracking-[0.16em] uppercase">
            {table.zone ?? 'Main floor'} · {table.capacity}p
          </span>
          <span className={cn('flex items-center gap-1.5 text-[11px] font-semibold', cfg.text)}>
            <span className={cn('size-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
          </span>
        </div>
        <h3 className="text-ink-950 mt-1.5 font-serif text-2xl font-medium -tracking-tight">
          {table.name}
        </h3>
      </div>

      {/* QR */}
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
              {canEdit ? (
                <Button size="xs" variant="outline" onClick={onRegenerate} disabled={pending}>
                  Regenerate
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Session */}
      <div className="border-border border-b px-5 py-4">
        <p className="text-ink-400 mb-2 text-[10px] font-bold tracking-[0.16em] uppercase">
          Current session
        </p>
        {table.activeSessionCustomer ? (
          <>
            <p className="text-ink-950 text-sm font-semibold">{table.activeSessionCustomer}</p>
            <p className="text-ink-500 mt-0.5 text-xs">Status: {cfg.label.toLowerCase()}</p>
            {canProcessPayments &&
            table.activeSessionId &&
            (table.status === 'bill_requested' || table.status === 'needs_review') ? (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => onSettleAtCounter('cash')} disabled={pending}>
                  Settle cash
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSettleAtCounter('terminal')}
                  disabled={pending}
                >
                  Terminal
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-ink-500 text-xs">No active dining session.</p>
        )}
      </div>

      {/* Edit / actions */}
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
            <Link href={`/admin/tables/${table.id}`}>
              <Button size="sm">Details</Button>
            </Link>
            {canEdit ? (
              <>
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
              </>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

function TableList({
  tables,
  canPrintQr,
  onSelect,
}: {
  tables: ManagerTable[];
  canPrintQr: boolean;
  onSelect: (t: ManagerTable) => void;
}) {
  return (
    <section className="border-border overflow-hidden rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-canvas-50">
            <TableHead>Table</TableHead>
            <TableHead>Zone</TableHead>
            <TableHead>Capacity</TableHead>
            <TableHead>Status</TableHead>
            {canPrintQr ? <TableHead>QR token</TableHead> : null}
            <TableHead className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tables.map((table) => {
            const cfg = STATUS_CONFIG[table.status];
            return (
              <TableRow key={table.id}>
                <TableCell>
                  <div className="text-ink-950 text-sm font-semibold">{table.name}</div>
                  <div className="text-ink-400 font-mono text-[11px]">#{table.number}</div>
                </TableCell>
                <TableCell className="text-ink-700 text-sm">{table.zone ?? 'Main floor'}</TableCell>
                <TableCell className="text-ink-700 font-mono text-sm">{table.capacity}</TableCell>
                <TableCell>
                  <span className={cn('flex items-center gap-1.5 text-xs font-semibold', cfg.text)}>
                    <span className={cn('size-1.5 rounded-full', cfg.dot)} />
                    {cfg.label}
                  </span>
                </TableCell>
                {canPrintQr ? (
                  <TableCell className="text-ink-400 font-mono text-xs">{table.qrToken}</TableCell>
                ) : null}
                <TableCell className="text-right">
                  <Button size="xs" variant="outline" onClick={() => onSelect(table)}>
                    Inspect
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

function QRGallery({ tables, canPrintQr }: { tables: ManagerTable[]; canPrintQr: boolean }) {
  if (!canPrintQr) {
    return (
      <div className="border-ink-200 text-ink-500 rounded-md border border-dashed py-12 text-center text-sm">
        You do not have permission to view QR tokens.
      </div>
    );
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
    >
      {tables.map((table) => (
        <article
          key={table.id}
          className="border-border flex flex-col items-center gap-3 rounded-md border bg-white p-4 text-center"
        >
          <div className="border-border rounded-md border p-2.5">
            <QRCodeSVG value={table.qrUrl} size={110} level="M" />
          </div>
          <div>
            <p className="text-ink-950 font-serif text-lg font-medium -tracking-tight">
              {table.name}
            </p>
            <p className="text-ink-500 text-xs">
              {table.zone ?? 'Main floor'} · {table.capacity}p
            </p>
          </div>
          <Link href={`/admin/tables/${table.id}/print`} target="_blank">
            <Button size="xs" variant="outline">
              Print
            </Button>
          </Link>
        </article>
      ))}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
