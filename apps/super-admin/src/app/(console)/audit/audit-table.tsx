'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AuditRow {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  actorName: string;
  actorEmail: string;
  targetRestaurant: string;
  ip: string;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

interface Props {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  actionFilter: string;
}

export function AuditTable({ rows, total, page, pageSize, actionFilter }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterInput, setFilterInput] = useState(actionFilter);
  const totalPages = Math.ceil(total / pageSize);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function navigate(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { action: filterInput, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    router.push(`/audit?${p.toString()}`);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ action: filterInput, page: '1' });
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          placeholder="Filter by action..."
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          className="border-input focus-visible:ring-ring rounded-md border bg-transparent px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
        >
          Filter
        </button>
      </form>

      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border bg-muted/50 border-b text-left">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Resource</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                  No audit log entries.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <>
                  <tr
                    key={r.id}
                    className="border-border hover:bg-muted/30 cursor-pointer border-b last:border-0"
                    onClick={() => toggleExpand(r.id)}
                  >
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{r.actorName}</div>
                      <div className="text-muted-foreground text-xs">{r.actorEmail}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.resource}
                      {r.resourceId && (
                        <span className="text-muted-foreground ml-1">({r.resourceId})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.targetRestaurant || '-'}</td>
                    <td className="text-muted-foreground px-4 py-3 font-mono text-xs">{r.ip}</td>
                  </tr>
                  {expanded.has(r.id) && r.diff && (
                    <tr key={`${r.id}-diff`} className="border-border border-b">
                      <td colSpan={6} className="bg-muted/20 px-4 py-3">
                        <pre className="overflow-x-auto text-xs whitespace-pre-wrap">
                          {JSON.stringify(r.diff, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => navigate({ page: String(page - 1) })}
              className="border-input rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => navigate({ page: String(page + 1) })}
              className="border-input rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
