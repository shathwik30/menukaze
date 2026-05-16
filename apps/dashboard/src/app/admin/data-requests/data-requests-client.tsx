'use client';

import { Input } from '@menukaze/ui';
import { useState, useTransition, type CSSProperties, type ReactNode } from 'react';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={summaryGridStyle}>
        <SummaryCard label="Request type" value={canExport ? 'Export' : 'Locked'} />
        <SummaryCard
          label="Erasure"
          value={canDelete ? 'Enabled' : 'Locked'}
          tone={canDelete ? 'danger' : undefined}
        />
        <SummaryCard label="Fulfilment" value="Manual" />
      </div>

      {!canExport && !canDelete ? (
        <section style={emptyStyle}>
          Your role does not include data export or erasure permissions.
        </section>
      ) : (
        <div style={requestGridStyle}>
          {canExport ? (
            <section style={cardStyle}>
              <CardHeader
                eyebrow="Export"
                title="Customer data bundle"
                description="Build a JSON bundle of every order and dine-in session associated with the customer's email."
              />
              <div
                style={{
                  padding: '0 22px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <Field label="Customer email">
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="customer@example.com"
                    autoComplete="off"
                  />
                </Field>
                <div style={checklistStyle}>
                  <ChecklistItem label="Orders" detail="Line items, totals, status history" />
                  <ChecklistItem
                    label="Dine-in sessions"
                    detail="Table session metadata and receipts"
                  />
                  <ChecklistItem
                    label="Customer profile"
                    detail="Name, phone, email, lifetime metrics"
                  />
                </div>
                <button
                  type="button"
                  onClick={onExport}
                  disabled={!email || exporting}
                  style={primaryButton(!email || exporting)}
                >
                  {exporting ? 'Exporting...' : 'Export JSON'}
                </button>
                <StatusMessage status={exportStatus} />
              </div>
            </section>
          ) : null}

          {canDelete ? (
            <section
              style={{
                ...cardStyle,
                borderColor: 'var(--mk-rose-200)',
                background: 'var(--mk-rose-50)',
              }}
            >
              <CardHeader
                eyebrow="Right to erasure"
                title="Anonymise customer data"
                description="Replace personal fields while preserving order totals, tax records, items, and operational history."
              />
              <div
                style={{
                  padding: '0 22px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <Field label="Customer email">
                  <Input
                    type="email"
                    value={deleteEmail}
                    onChange={(event) => setDeleteEmail(event.target.value)}
                    placeholder="customer@example.com"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Confirmation">
                  <Input
                    type="text"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Type DELETE"
                    autoComplete="off"
                  />
                </Field>
                <div style={dangerNoticeStyle}>
                  This action cannot be undone. Verify identity before running erasure.
                </div>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={!deleteEmail || confirm !== 'DELETE' || deleting}
                  style={dangerButton(!deleteEmail || confirm !== 'DELETE' || deleting)}
                >
                  {deleting ? 'Anonymising...' : 'Anonymise data'}
                </button>
                <StatusMessage status={deleteStatus} />
              </div>
            </section>
          ) : null}
        </div>
      )}

      <section style={infoPanelStyle}>
        <div style={infoIconStyle}>i</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mk-lapis-700)' }}>
            Always verify identity before fulfilling.
          </div>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12.5,
              color: 'var(--mk-lapis-700)',
              lineHeight: 1.5,
            }}
          >
            Match the request against an order phone, email, or saved receipt trail, then record the
            decision in the audit log.
          </p>
        </div>
      </section>
    </div>
  );
}

function CardHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div style={{ padding: '20px 22px 16px' }}>
      <div style={eyebrowStyle}>{eyebrow}</div>
      <h2 style={titleStyle}>{title}</h2>
      <p style={descriptionStyle}>{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div style={summaryCardStyle}>
      <div style={eyebrowStyle}>{label}</div>
      <div
        style={{
          marginTop: 6,
          fontFamily: 'var(--font-serif)',
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: tone === 'danger' ? 'var(--mk-rose-700)' : 'var(--mk-ink-950)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ChecklistItem({ label, detail }: { label: string; detail: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={checkDotStyle} />
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--mk-ink-900)' }}>{label}</div>
        <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--mk-ink-500)' }}>{detail}</div>
      </div>
    </div>
  );
}

function StatusMessage({ status }: { status: Status }) {
  if (status.kind === 'idle') return null;
  return (
    <p
      role={status.kind === 'error' ? 'alert' : 'status'}
      style={status.kind === 'error' ? errorStatusStyle : successStatusStyle}
    >
      {status.message}
    </p>
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

const summaryGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 12,
};

const requestGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 16,
  alignItems: 'start',
};

const summaryCardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 12,
  border: '1px solid var(--mk-ink-100)',
  background: 'var(--mk-canvas-50)',
};

const cardStyle: CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--mk-ink-100)',
  background: 'white',
  boxShadow: 'var(--shadow-xs)',
  overflow: 'hidden',
};

const checklistStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 14,
  borderRadius: 10,
  border: '1px solid var(--mk-ink-100)',
  background: 'var(--mk-canvas-50)',
};

const dangerNoticeStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 9,
  border: '1px solid var(--mk-rose-200)',
  background: 'white',
  color: 'var(--mk-rose-700)',
  fontSize: 12.5,
  fontWeight: 700,
};

const infoPanelStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  padding: '14px 18px',
  borderRadius: 12,
  border: '1px solid var(--mk-lapis-100)',
  background: 'var(--mk-lapis-50)',
};

const infoIconStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--mk-lapis-200)',
  background: 'white',
  color: 'var(--mk-lapis-700)',
  fontFamily: 'var(--font-serif)',
  fontWeight: 700,
  flexShrink: 0,
};

const emptyStyle: CSSProperties = {
  padding: '48px 24px',
  borderRadius: 14,
  border: '1.5px dashed var(--mk-ink-200)',
  background: 'var(--mk-canvas-50)',
  textAlign: 'center',
  color: 'var(--mk-ink-500)',
  fontSize: 13.5,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--mk-ink-400)',
};

const titleStyle: CSSProperties = {
  margin: '7px 0 0',
  fontFamily: 'var(--font-serif)',
  fontSize: 24,
  fontWeight: 500,
  letterSpacing: '-0.02em',
  color: 'var(--mk-ink-950)',
};

const descriptionStyle: CSSProperties = {
  margin: '7px 0 0',
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--mk-ink-500)',
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--mk-ink-500)',
};

const checkDotStyle: CSSProperties = {
  width: 8,
  height: 8,
  marginTop: 4,
  borderRadius: 99,
  background: 'var(--mk-jade-500)',
  flexShrink: 0,
};

const successStatusStyle: CSSProperties = {
  margin: 0,
  padding: '9px 11px',
  borderRadius: 9,
  background: 'var(--mk-jade-50)',
  color: 'var(--mk-jade-700)',
  fontSize: 12.5,
  fontWeight: 700,
};

const errorStatusStyle: CSSProperties = {
  margin: 0,
  padding: '9px 11px',
  borderRadius: 9,
  background: 'var(--mk-rose-50)',
  color: 'var(--mk-rose-700)',
  fontSize: 12.5,
  fontWeight: 700,
};

function primaryButton(disabled: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    padding: '0 14px',
    borderRadius: 9,
    border: '1px solid var(--mk-ink-950)',
    background: 'var(--mk-ink-950)',
    color: 'var(--mk-canvas-50)',
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

function dangerButton(disabled: boolean): CSSProperties {
  return {
    ...primaryButton(disabled),
    border: '1px solid var(--mk-rose-700)',
    background: 'var(--mk-rose-700)',
  };
}
