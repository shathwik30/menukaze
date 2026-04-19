'use client';

import { Button, Input } from '@menukaze/ui';
import { useState, useTransition } from 'react';
import {
  deleteCustomerDataAction,
  exportCustomerDataAction,
  type DsarBundle,
  type DsarDeletionSummary,
} from '@/app/actions/dsar';

interface Props {
  canExport: boolean;
  canDelete: boolean;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export function DataRequestsClient({ canExport, canDelete }: Props) {
  const [email, setEmail] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [confirm, setConfirm] = useState('');
  const [exportStatus, setExportStatus] = useState<Status>({ kind: 'idle' });
  const [deleteStatus, setDeleteStatus] = useState<Status>({ kind: 'idle' });
  const [exporting, startExport] = useTransition();
  const [deleting, startDelete] = useTransition();

  const onExport = (): void => {
    setExportStatus({ kind: 'idle' });
    startExport(async () => {
      const result = await exportCustomerDataAction({ email });
      if (!result.ok) {
        setExportStatus({ kind: 'error', message: result.error });
        return;
      }
      downloadJson(result.data, `dsar-${result.data.customerEmail}-${Date.now()}.json`);
      const counts = `${result.data.orders.length} order(s), ${result.data.tableSessions.length} session(s)`;
      setExportStatus({ kind: 'success', message: `Exported ${counts}.` });
    });
  };

  const onDelete = (): void => {
    setDeleteStatus({ kind: 'idle' });
    startDelete(async () => {
      const result = await deleteCustomerDataAction({ email: deleteEmail, confirm });
      if (!result.ok) {
        setDeleteStatus({ kind: 'error', message: result.error });
        return;
      }
      const summary: DsarDeletionSummary = result.data;
      setDeleteStatus({
        kind: 'success',
        message: `Anonymised ${summary.ordersAnonymised} order(s) and ${summary.sessionsAnonymised} session(s).`,
      });
      setConfirm('');
    });
  };

  return (
    <div className="flex flex-col gap-8">
      {canExport ? (
        <section className="border-border space-y-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">Export</h2>
          <p className="text-muted-foreground text-sm">
            Build a JSON bundle of every order and dine-in session associated with the
            customer&apos;s email. Downloaded directly to your browser.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium">Customer email</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                className="border-border h-9 rounded-md border px-3"
                autoComplete="off"
              />
            </label>
            <Button
              variant="plain"
              size="none"
              type="button"
              onClick={onExport}
              disabled={!email || exporting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export JSON'}
            </Button>
          </div>
          {exportStatus.kind === 'success' ? (
            <p className="text-sm text-emerald-600">{exportStatus.message}</p>
          ) : null}
          {exportStatus.kind === 'error' ? (
            <p className="text-sm text-red-600">{exportStatus.message}</p>
          ) : null}
        </section>
      ) : null}

      {canDelete ? (
        <section className="space-y-3 rounded-md border border-red-200 bg-red-50/40 p-4 dark:border-red-900/50 dark:bg-red-950/20">
          <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">
            Anonymise (right to erasure)
          </h2>
          <p className="text-muted-foreground text-sm">
            Replaces name, email, and phone on every order and session for this email with
            placeholder values. Order totals, items, and tax records are preserved (required for tax
            / accounting law). This action cannot be undone.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Customer email</span>
              <Input
                type="email"
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                placeholder="customer@example.com"
                className="border-border bg-background h-9 rounded-md border px-3"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                Type <code className="font-mono">DELETE</code> to confirm
              </span>
              <Input
                type="text"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="border-border bg-background h-9 rounded-md border px-3"
                autoComplete="off"
              />
            </label>
            <Button
              variant="plain"
              size="none"
              type="button"
              onClick={onDelete}
              disabled={!deleteEmail || confirm !== 'DELETE' || deleting}
              className="inline-flex h-9 w-fit items-center rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Anonymising…' : 'Anonymise data'}
            </Button>
          </div>
          {deleteStatus.kind === 'success' ? (
            <p className="text-sm text-emerald-600">{deleteStatus.message}</p>
          ) : null}
          {deleteStatus.kind === 'error' ? (
            <p className="text-sm text-red-600">{deleteStatus.message}</p>
          ) : null}
        </section>
      ) : null}

      {!canExport && !canDelete ? (
        <p className="text-muted-foreground text-sm">
          Your role doesn&apos;t include any data request permissions.
        </p>
      ) : null}
    </div>
  );
}

function downloadJson(payload: DsarBundle, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
