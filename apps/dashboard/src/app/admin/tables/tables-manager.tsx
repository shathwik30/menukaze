'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  createTableAction,
  updateTableAction,
  deleteTableAction,
  regenerateQrTokenAction,
} from '@/app/actions/tables-admin';

export interface ManagerTable {
  id: string;
  number: number;
  name: string;
  capacity: number;
  zone?: string;
  qrToken: string;
  status: 'available' | 'occupied' | 'bill_requested' | 'paid' | 'needs_review';
  qrUrl: string;
}

interface Props {
  tables: ManagerTable[];
}

const STATUS_LABEL: Record<ManagerTable['status'], string> = {
  available: 'Available',
  occupied: 'Occupied',
  bill_requested: 'Bill requested',
  paid: 'Paid — clearing',
  needs_review: 'Needs review',
};
const STATUS_STYLE: Record<ManagerTable['status'], string> = {
  available: 'bg-emerald-100 text-emerald-800',
  occupied: 'bg-blue-100 text-blue-800',
  bill_requested: 'bg-amber-100 text-amber-800',
  paid: 'bg-zinc-100 text-zinc-700',
  needs_review: 'bg-red-100 text-red-800',
};

export function TablesManager({ tables }: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <CreateTableForm
        nextNumber={(tables.at(-1)?.number ?? 0) + 1}
        onSubmit={(input) => run(() => createTableAction(input))}
        pending={isPending}
      />

      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}

      {tables.length === 0 ? (
        <p className="text-muted-foreground text-sm">No tables yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onUpdate={(patch) => run(() => updateTableAction({ id: table.id, ...patch }))}
              onDelete={() => {
                if (
                  window.confirm(
                    `Delete ${table.name}? This cannot be undone — make sure the physical sticker is removed first.`,
                  )
                ) {
                  run(() => deleteTableAction(table.id));
                }
              }}
              onRegenerate={() => {
                if (
                  window.confirm(
                    `Regenerate the QR for ${table.name}? Existing stickers will stop resolving.`,
                  )
                ) {
                  run(() => regenerateQrTokenAction(table.id));
                }
              }}
              pending={isPending}
            />
          ))}
        </div>
      )}
    </>
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
        const n = Number.parseInt(number, 10);
        const c = Number.parseInt(capacity, 10) || 4;
        if (!Number.isFinite(n) || n < 1) return;
        onSubmit({
          number: n,
          ...(name.trim() ? { name: name.trim() } : {}),
          capacity: c,
          ...(zone.trim() ? { zone: zone.trim() } : {}),
        });
        setNumber(String(n + 1));
        setName('');
        setZone('');
      }}
      className="border-border flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3"
    >
      <label className="flex flex-col gap-1 text-xs">
        Number
        <input
          type="number"
          min="1"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="border-input bg-background h-9 w-20 rounded-md border px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Name (optional)
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Table ${number}`}
          className="border-input bg-background h-9 w-36 rounded-md border px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Capacity
        <input
          type="number"
          min="1"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="border-input bg-background h-9 w-20 rounded-md border px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Zone (optional)
        <input
          type="text"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          placeholder="Patio, Bar…"
          className="border-input bg-background h-9 w-36 rounded-md border px-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium disabled:opacity-50"
      >
        Add table
      </button>
    </form>
  );
}

function TableCard({
  table,
  onUpdate,
  onDelete,
  onRegenerate,
  pending,
}: {
  table: ManagerTable;
  onUpdate: (patch: { name?: string; capacity?: number; zone?: string }) => void;
  onDelete: () => void;
  onRegenerate: () => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(table.name);
  const [capacity, setCapacity] = useState(String(table.capacity));
  const [zone, setZone] = useState(table.zone ?? '');

  return (
    <article className="border-border rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide">#{table.number}</p>
          <h3 className="text-foreground text-base font-semibold">{table.name}</h3>
          <p className="text-muted-foreground text-xs">
            Seats {table.capacity}
            {table.zone ? ` · ${table.zone}` : ''}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${STATUS_STYLE[table.status]}`}
        >
          {STATUS_LABEL[table.status]}
        </span>
      </div>

      <div className="border-border mt-3 flex items-center justify-center rounded-md border bg-white p-3">
        <QRCodeSVG value={table.qrUrl} size={120} level="M" />
      </div>

      <p className="text-muted-foreground mt-2 truncate text-[10px]">{table.qrUrl}</p>

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const c = Number.parseInt(capacity, 10) || table.capacity;
            onUpdate({
              name: name.trim() || undefined,
              capacity: c,
              zone: zone.trim() || undefined,
            });
            setEditing(false);
          }}
          className="mt-3 flex flex-col gap-2"
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          />
          <input
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          />
          <input
            type="text"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-primary text-primary-foreground h-8 rounded-md px-3 text-xs disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="border-input h-8 rounded-md border px-3 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => window.open(`/admin/tables/${table.id}/print`, '_blank')}
            className="border-input rounded-md border px-2 py-1"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="border-input rounded-md border px-2 py-1"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onRegenerate}
            className="border-input rounded-md border px-2 py-1 disabled:opacity-50"
          >
            New QR
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="text-destructive rounded-md px-2 py-1 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
