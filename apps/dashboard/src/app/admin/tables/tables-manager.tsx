'use client';

import Link from 'next/link';
import { Input } from '@menukaze/ui';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Ably from 'ably';
import { channels, isTableStatusChangedEvent, isWaiterCalledEvent } from '@menukaze/realtime';
import { QRCodeSVG } from 'qrcode.react';
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
  { value: 'list', label: 'Table list' },
  { value: 'qr', label: 'QR codes' },
];

const STATUS_CONFIG: Record<
  ManagerTable['status'],
  { label: string; dot: string; bg: string; fg: string }
> = {
  available: {
    label: 'Available',
    dot: 'var(--mk-jade-500)',
    bg: 'var(--mk-jade-50)',
    fg: 'var(--mk-jade-700)',
  },
  occupied: {
    label: 'Occupied',
    dot: 'var(--mk-saffron-500)',
    bg: 'var(--mk-saffron-50)',
    fg: 'var(--mk-saffron-800)',
  },
  bill_requested: {
    label: 'Bill requested',
    dot: 'var(--mk-lapis-500)',
    bg: 'var(--mk-lapis-50)',
    fg: 'var(--mk-lapis-700)',
  },
  paid: {
    label: 'Paid - clearing',
    dot: 'var(--mk-ink-400)',
    bg: 'var(--mk-canvas-200)',
    fg: 'var(--mk-ink-600)',
  },
  needs_review: {
    label: 'Needs review',
    dot: 'var(--mk-rose-500)',
    bg: 'var(--mk-rose-50)',
    fg: 'var(--mk-rose-700)',
  },
};

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
    setSelectedId((current) => current ?? tables[0]?.id ?? null);
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
      setAlerts((prev) => {
        const next = [
          { id: `${tableId}:${createdAt}:${message}`, tableId, createdAt, message },
          ...prev,
        ];
        return next.slice(0, 6);
      });
    };

    const handler = (message: Ably.Message) => {
      const payload: unknown = message.data;

      if (isTableStatusChangedEvent(payload)) {
        setRows((prev) =>
          prev.map((table) =>
            table.id === payload.tableId ? { ...table, status: payload.status } : table,
          ),
        );
        if (payload.status === 'needs_review') {
          const tableName =
            rowsRef.current.find((table) => table.id === payload.tableId)?.name ?? 'Table';
          upsertAlert(
            payload.tableId,
            payload.changedAt,
            `${tableName} needs review. Payment is still outstanding.`,
          );
        }
      }

      if (isWaiterCalledEvent(payload)) {
        const tableName =
          rowsRef.current.find((table) => table.id === payload.tableId)?.name ?? 'Table';
        upsertAlert(
          payload.tableId,
          payload.calledAt,
          payload.reason === 'payment_help'
            ? `${tableName} requested payment assistance.`
            : `${tableName} called for a waiter.`,
        );
      }
    };

    void channel.subscribe(handler);
    return () => {
      channel.unsubscribe(handler);
      client.close();
    };
  }, [restaurantId]);

  const selected = rows.find((table) => table.id === selectedId) ?? rows[0] ?? null;
  const countsByStatus = useMemo(() => {
    const counts = new Map<ManagerTable['status'], number>();
    for (const table of rows) counts.set(table.status, (counts.get(table.status) ?? 0) + 1);
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
    table: ManagerTable,
    patch: { name?: string; capacity?: number; zone?: string },
  ) => run(() => updateTableAction({ id: table.id, ...patch }));

  const deleteTable = (table: ManagerTable) => {
    if (
      window.confirm(
        `Delete ${table.name}? This cannot be undone. Make sure the physical QR sticker is removed first.`,
      )
    ) {
      run(() => deleteTableAction(table.id));
    }
  };

  const regenerateQr = (table: ManagerTable) => {
    if (
      window.confirm(`Regenerate the QR for ${table.name}? Existing stickers will stop resolving.`)
    ) {
      run(() => regenerateQrTokenAction(table.id));
    }
  };

  const settleAtCounter = (table: ManagerTable, method: 'cash' | 'terminal') =>
    run(() =>
      settleSessionAtCounterAction({
        sessionId: table.activeSessionId,
        method,
      }),
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {canEdit ? (
        <CreateTableForm
          nextNumber={(rows.at(-1)?.number ?? 0) + 1}
          onSubmit={(input) => run(() => createTableAction(input))}
          pending={isPending}
        />
      ) : null}

      <section
        style={{
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px solid var(--mk-ink-100)',
          background: 'white',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
              color: 'var(--mk-ink-600)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 99,
                background: connected ? 'var(--mk-jade-500)' : 'var(--mk-ink-300)',
              }}
            />
            {connected ? 'Live table sync is active' : 'Connecting live table sync...'}
          </div>
          {alerts.length > 0 ? (
            <button
              type="button"
              onClick={() => setAlerts([])}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--mk-ink-500)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Clear alerts
            </button>
          ) : null}
        </div>
        {alerts.length > 0 ? (
          <ul
            style={{
              listStyle: 'none',
              margin: '12px 0 0',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {alerts.map((alert) => (
              <li
                key={alert.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 9,
                  background: 'var(--mk-saffron-50)',
                  color: 'var(--mk-saffron-800)',
                  fontSize: 12.5,
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{alert.message}</p>
                  <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAlerts((prev) => prev.filter((item) => item.id !== alert.id))}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                  }}
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '10px 12px',
            borderRadius: 9,
            background: 'var(--mk-rose-50)',
            color: 'var(--mk-rose-700)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </p>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            gap: 2,
            padding: 3,
            borderRadius: 10,
            background: 'var(--mk-canvas-100)',
          }}
        >
          {TABLE_VIEWS.map((option) => {
            const active = view === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setView(option.value)}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 8,
                  background: active ? 'white' : 'transparent',
                  color: active ? 'var(--mk-ink-950)' : 'var(--mk-ink-500)',
                  boxShadow: active ? 'var(--shadow-xs)' : 'none',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {(
            Object.entries(STATUS_CONFIG) as Array<
              [ManagerTable['status'], (typeof STATUS_CONFIG)[ManagerTable['status']]]
            >
          )
            .slice(0, 5)
            .map(([status, config]) => (
              <div
                key={status}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--mk-ink-600)',
                  fontSize: 12,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 99, background: config.dot }} />
                <span>{config.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--mk-ink-400)' }}>
                  {countsByStatus.get(status) ?? 0}
                </span>
              </div>
            ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            borderRadius: 14,
            border: '1.5px dashed var(--mk-ink-200)',
            background: 'var(--mk-canvas-50)',
            textAlign: 'center',
            color: 'var(--mk-ink-500)',
            fontSize: 13.5,
          }}
        >
          No tables yet.
        </div>
      ) : view === 'floor' ? (
        <FloorPlan
          tables={rows}
          selected={selected}
          onSelect={(table) => setSelectedId(table.id)}
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
          onSelect={(table) => {
            setSelectedId(table.id);
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
      onSubmit={(event) => {
        event.preventDefault();
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
      style={{
        display: 'grid',
        gridTemplateColumns: '92px minmax(160px, 1fr) 96px minmax(140px, 180px) auto',
        gap: 10,
        alignItems: 'end',
        padding: 14,
        borderRadius: 14,
        border: '1.5px dashed var(--mk-ink-200)',
        background: 'var(--mk-canvas-50)',
      }}
    >
      <Field label="Number">
        <Input
          type="number"
          min="1"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
        />
      </Field>
      <Field label="Name">
        <Input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`Table ${number}`}
        />
      </Field>
      <Field label="Capacity">
        <Input
          type="number"
          min="1"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
        />
      </Field>
      <Field label="Zone">
        <Input
          type="text"
          value={zone}
          onChange={(event) => setZone(event.target.value)}
          placeholder="Patio"
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        style={{
          height: 38,
          padding: '0 14px',
          borderRadius: 9,
          background: 'var(--mk-ink-950)',
          color: 'var(--mk-canvas-50)',
          border: '1px solid var(--mk-ink-950)',
          fontSize: 13,
          fontWeight: 600,
          cursor: pending ? 'not-allowed' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        Add table
      </button>
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
  onSelect: (table: ManagerTable) => void;
  canEdit: boolean;
  canPrintQr: boolean;
  canProcessPayments: boolean;
  pending: boolean;
  onUpdate: (
    table: ManagerTable,
    patch: { name?: string; capacity?: number; zone?: string },
  ) => void;
  onDelete: (table: ManagerTable) => void;
  onRegenerate: (table: ManagerTable) => void;
  onSettleAtCounter: (table: ManagerTable, method: 'cash' | 'terminal') => void;
}) {
  const zones = useMemo(() => {
    const map = new Map<string, ManagerTable[]>();
    for (const table of tables) {
      const zone = table.zone?.trim() || 'Main floor';
      const list = map.get(zone) ?? [];
      list.push(table);
      map.set(zone, list);
    }
    return Array.from(map.entries()).map(([zone, rows]) => ({ zone, rows }));
  }, [tables]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: selected ? '1fr 360px' : '1fr',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <section
        style={{
          minHeight: 540,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 14,
          border: '1px solid var(--mk-ink-100)',
          background: 'white',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(var(--mk-ink-100) 1px, transparent 1px), linear-gradient(90deg, var(--mk-ink-100) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            opacity: 0.55,
          }}
        />
        <div
          style={{
            position: 'relative',
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {zones.map(({ zone, rows }) => (
            <div key={zone}>
              <div
                style={{
                  marginBottom: 10,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--mk-ink-500)',
                }}
              >
                {zone}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))',
                  gap: 12,
                }}
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
  const status = STATUS_CONFIG[table.status];
  const round = table.capacity <= 2;
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        minHeight: round ? 82 : 92,
        aspectRatio: round ? '1' : '1.12',
        borderRadius: round ? 999 : 12,
        background: status.bg,
        color: 'var(--mk-ink-950)',
        border: `1.5px solid ${selected ? 'var(--mk-ink-950)' : status.dot}`,
        boxShadow: selected
          ? '0 0 0 3px var(--mk-saffron-200), var(--shadow-md)'
          : 'var(--shadow-xs)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 7,
          height: 7,
          borderRadius: 99,
          background: status.dot,
        }}
      />
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{table.name}</span>
      <span style={{ fontSize: 10.5, color: 'var(--mk-ink-500)' }}>{table.capacity} seats</span>
      {table.activeSessionCustomer ? (
        <span
          style={{
            marginTop: 2,
            maxWidth: '90%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 10.5,
            color: status.fg,
          }}
        >
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
  const status = STATUS_CONFIG[table.status];

  useEffect(() => {
    setName(table.name);
    setCapacity(String(table.capacity));
    setZone(table.zone ?? '');
    setEditing(false);
  }, [table.id, table.name, table.capacity, table.zone]);

  return (
    <aside
      style={{
        position: 'sticky',
        top: 80,
        borderRadius: 14,
        border: '1px solid var(--mk-ink-100)',
        background: 'white',
        boxShadow: 'var(--shadow-xs)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 22, borderBottom: '1px solid var(--mk-ink-100)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--mk-ink-400)',
            }}
          >
            {table.zone ?? 'Main floor'} · {table.capacity} seats
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              color: status.fg,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 99, background: status.dot }} />
            {status.label}
          </span>
        </div>
        <h3
          style={{
            margin: '8px 0 0',
            fontFamily: 'var(--font-serif)',
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: 'var(--mk-ink-950)',
          }}
        >
          {table.name}
        </h3>
      </div>

      {canPrintQr && table.qrUrl ? (
        <div
          style={{
            padding: 22,
            borderBottom: '1px solid var(--mk-ink-100)',
            display: 'flex',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              padding: 10,
              borderRadius: 10,
              border: '1px solid var(--mk-ink-100)',
              background: 'white',
              flexShrink: 0,
            }}
          >
            <QRCodeSVG value={table.qrUrl} size={112} level="M" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--mk-ink-400)',
              }}
            >
              Scan-to-order URL
            </div>
            <div
              style={{
                marginTop: 5,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--mk-ink-700)',
                wordBreak: 'break-all',
              }}
            >
              {table.qrUrl}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Link
                href={`/admin/tables/${table.id}/print`}
                target="_blank"
                style={smallActionLink()}
              >
                Print
              </Link>
              {canEdit ? (
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={pending}
                  style={smallActionButton(pending)}
                >
                  Regenerate
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ padding: 22, borderBottom: '1px solid var(--mk-ink-100)' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--mk-ink-400)',
            marginBottom: 10,
          }}
        >
          Current session
        </div>
        {table.activeSessionCustomer ? (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--mk-ink-950)' }}>
              {table.activeSessionCustomer}
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: 'var(--mk-ink-500)' }}>
              Status: {status.label.toLowerCase()}
            </div>
            {canProcessPayments &&
            table.activeSessionId &&
            (table.status === 'bill_requested' || table.status === 'needs_review') ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onSettleAtCounter('cash')}
                  style={primaryButton(pending)}
                >
                  Settle cash
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onSettleAtCounter('terminal')}
                  style={outlineButton(pending)}
                >
                  Terminal
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--mk-ink-500)' }}>
            No active dining session.
          </div>
        )}
      </div>

      <div style={{ padding: 22 }}>
        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const nextCapacity = Number.parseInt(capacity, 10) || table.capacity;
              onUpdate({
                name: name.trim() || undefined,
                capacity: nextCapacity,
                zone: zone.trim() || undefined,
              });
              setEditing(false);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <Field label="Name">
              <Input type="text" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Capacity">
              <Input
                type="number"
                min="1"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
              />
            </Field>
            <Field label="Zone">
              <Input type="text" value={zone} onChange={(event) => setZone(event.target.value)} />
            </Field>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" disabled={pending} style={primaryButton(pending)}>
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} style={outlineButton(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Link href={`/admin/tables/${table.id}`} style={primaryLink()}>
              Details
            </Link>
            {canEdit ? (
              <>
                <button type="button" onClick={() => setEditing(true)} style={outlineButton(false)}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={pending}
                  style={dangerButton(pending)}
                >
                  Delete
                </button>
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
  onSelect: (table: ManagerTable) => void;
}) {
  return (
    <section
      style={{
        background: 'white',
        border: '1px solid var(--mk-ink-100)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-xs)',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--mk-canvas-50)' }}>
            {['Table', 'Zone', 'Capacity', 'Status', 'QR token', ''].map((heading) => (
              <th
                key={heading}
                style={{
                  padding: '11px 16px',
                  textAlign: heading === '' ? 'right' : 'left',
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--mk-ink-500)',
                  borderBottom: '1px solid var(--mk-ink-100)',
                }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tables.map((table) => {
            const status = STATUS_CONFIG[table.status];
            return (
              <tr key={table.id}>
                <td style={tableCell()}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--mk-ink-950)' }}>
                    {table.name}
                  </div>
                  <div
                    style={{
                      marginTop: 1,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--mk-ink-400)',
                    }}
                  >
                    #{table.number}
                  </div>
                </td>
                <td style={tableCell()}>{table.zone ?? 'Main floor'}</td>
                <td style={tableCell('mono')}>{table.capacity}</td>
                <td style={tableCell()}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: status.fg,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{ width: 7, height: 7, borderRadius: 99, background: status.dot }}
                    />
                    {status.label}
                  </span>
                </td>
                <td style={tableCell('mono')}>{canPrintQr ? table.qrToken : 'hidden'}</td>
                <td style={{ ...tableCell(), textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => onSelect(table)}
                    style={smallActionButton(false)}
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function QRGallery({ tables, canPrintQr }: { tables: ManagerTable[]; canPrintQr: boolean }) {
  if (!canPrintQr) {
    return (
      <div
        style={{
          padding: '48px 24px',
          borderRadius: 14,
          border: '1.5px dashed var(--mk-ink-200)',
          textAlign: 'center',
          color: 'var(--mk-ink-500)',
        }}
      >
        You do not have permission to view QR tokens.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: 14,
      }}
    >
      {tables.map((table) => (
        <article
          key={table.id}
          style={{
            padding: 16,
            textAlign: 'center',
            background: 'white',
            border: '1px solid var(--mk-ink-100)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              padding: 12,
              border: '1px solid var(--mk-ink-100)',
              borderRadius: 9,
              background: 'white',
            }}
          >
            <QRCodeSVG value={table.qrUrl} size={120} level="M" />
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: '-0.015em',
            }}
          >
            {table.name}
          </div>
          <div style={{ marginTop: 1, fontSize: 11, color: 'var(--mk-ink-500)' }}>
            {table.zone ?? 'Main floor'} · {table.capacity} seats
          </div>
          <Link
            href={`/admin/tables/${table.id}/print`}
            target="_blank"
            style={{ ...smallActionLink(), marginTop: 10 }}
          >
            Print
          </Link>
        </article>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--mk-ink-500)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function tableCell(kind?: 'mono') {
  return {
    padding: '12px 16px',
    fontSize: 13,
    color: 'var(--mk-ink-800)',
    borderBottom: '1px solid var(--mk-ink-100)',
    verticalAlign: 'middle',
    fontFamily: kind === 'mono' ? 'var(--font-mono)' : undefined,
  };
}

function primaryButton(disabled: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid var(--mk-ink-950)',
    background: 'var(--mk-ink-950)',
    color: 'var(--mk-canvas-50)',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

function outlineButton(disabled: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid var(--mk-ink-200)',
    background: 'white',
    color: 'var(--mk-ink-700)',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

function dangerButton(disabled: boolean) {
  return {
    ...outlineButton(disabled),
    color: 'var(--mk-rose-700)',
    border: '1px solid var(--mk-rose-200)',
  };
}

function smallActionButton(disabled: boolean) {
  return {
    ...outlineButton(disabled),
    height: 28,
    padding: '0 10px',
    fontSize: 11.5,
  };
}

function primaryLink() {
  return {
    ...primaryButton(false),
    textDecoration: 'none',
  };
}

function smallActionLink() {
  return {
    ...smallActionButton(false),
    display: 'inline-flex',
    textDecoration: 'none',
  };
}
