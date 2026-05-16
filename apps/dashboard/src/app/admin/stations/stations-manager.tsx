'use client';

import { useMemo, useRef, useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  archiveStationAction,
  createStationAction,
  updateStationAction,
} from '@/app/actions/stations';

interface Station {
  id: string;
  name: string;
  color: string;
  soundEnabled: boolean;
}

const DEFAULT_COLOR = 'var(--mk-saffron-500)';

const COLOR_PRESETS = [
  { label: 'Saffron', value: 'var(--mk-saffron-500)' },
  { label: 'Jade', value: 'var(--mk-jade-500)' },
  { label: 'Lapis', value: 'var(--mk-lapis-500)' },
  { label: 'Rose', value: 'var(--mk-rose-500)' },
  { label: 'Ink', value: 'var(--mk-ink-800)' },
] as const;

const NAMED_COLOR_MAP: Record<string, string> = {
  saffron: 'var(--mk-saffron-500)',
  amber: 'var(--mk-saffron-500)',
  jade: 'var(--mk-jade-500)',
  emerald: 'var(--mk-jade-500)',
  green: 'var(--mk-jade-500)',
  lapis: 'var(--mk-lapis-500)',
  blue: 'var(--mk-lapis-500)',
  rose: 'var(--mk-rose-500)',
  red: 'var(--mk-rose-500)',
  ink: 'var(--mk-ink-800)',
};

function resolveColor(raw: string): string {
  const key = raw.trim().toLowerCase();
  return NAMED_COLOR_MAP[key] ?? (raw || DEFAULT_COLOR);
}

export function StationsManager({ initial }: { initial: Station[] }) {
  const router = useRouter();
  const [stations, setStations] = useState<Station[]>(initial);
  const [draft, setDraft] = useState<Record<string, Station>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Create form state
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [newSound, setNewSound] = useState(true);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const soundCount = useMemo(() => stations.filter((s) => s.soundEnabled).length, [stations]);

  const getDraft = (s: Station): Station => draft[s.id] ?? s;

  const patchDraft = (id: string, patch: Partial<Station>) => {
    setDraft((prev) => {
      const base = prev[id] ?? stations.find((s) => s.id === id)!;
      return { ...prev, [id]: { ...base, ...patch } };
    });
  };

  const isDirty = (s: Station): boolean => {
    const d = draft[s.id];
    if (!d) return false;
    return d.name !== s.name || d.color !== s.color || d.soundEnabled !== s.soundEnabled;
  };

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    start(async () => {
      const result = await createStationAction({ name, color: newColor, soundEnabled: newSound });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStations((prev) => [
        ...prev,
        { id: result.data.id, name, color: newColor, soundEnabled: newSound },
      ]);
      setNewName('');
      setNewColor(DEFAULT_COLOR);
      setNewSound(true);
      nameInputRef.current?.focus();
      router.refresh();
    });
  };

  const save = (s: Station) => {
    const d = getDraft(s);
    setError(null);
    setPendingId(s.id);
    start(async () => {
      const result = await updateStationAction({
        stationId: s.id,
        name: d.name,
        color: d.color,
        soundEnabled: d.soundEnabled,
      });
      if (!result.ok) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      setStations((prev) => prev.map((item) => (item.id === s.id ? d : item)));
      setDraft((prev) => {
        const next = { ...prev };
        delete next[s.id];
        return next;
      });
      setPendingId(null);
      router.refresh();
    });
  };

  const discard = (s: Station) => {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[s.id];
      return next;
    });
  };

  const archive = (s: Station) => {
    if (!window.confirm(`Archive "${s.name}"? It will disappear from KDS tabs.`)) return;
    setError(null);
    setPendingId(s.id);
    start(async () => {
      const result = await archiveStationAction(s.id);
      if (!result.ok) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      setStations((prev) => prev.filter((item) => item.id !== s.id));
      setPendingId(null);
      router.refresh();
    });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 300px',
        gap: 20,
        alignItems: 'start',
      }}
    >
      {/* ── Left: stats + station list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Stats strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid var(--mk-ink-100)',
            background: 'var(--mk-ink-100)',
          }}
        >
          <Stat label="Stations" value={String(stations.length)} />
          <Stat label="Sound enabled" value={String(soundCount)} accent={soundCount > 0} />
          <Stat label="KDS routing" value={stations.length > 0 ? 'Routed' : 'Full feed'} />
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 9,
              background: 'var(--mk-rose-50)',
              color: 'var(--mk-rose-700)',
              fontSize: 13,
              fontWeight: 500,
              border: '1px solid var(--mk-rose-100)',
            }}
          >
            {error}
          </div>
        ) : null}

        {/* Station rows */}
        {stations.length === 0 ? (
          <div
            style={{
              padding: '56px 32px',
              borderRadius: 14,
              border: '1.5px dashed var(--mk-ink-200)',
              background: 'var(--mk-canvas-50)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                margin: '0 auto 14px',
                background: 'var(--mk-saffron-50)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--mk-saffron-500)"
                strokeWidth="1.75"
                strokeLinecap="round"
                style={{ width: 22, height: 22 }}
                aria-hidden
              >
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--mk-ink-700)' }}>
              No stations yet
            </p>
            <p
              style={{
                margin: '5px 0 0',
                fontSize: 12.5,
                color: 'var(--mk-ink-400)',
                lineHeight: 1.5,
              }}
            >
              The KDS shows all orders until you add a station.
              <br />
              Add your first one using the form on the right.
            </p>
          </div>
        ) : (
          <div
            style={{
              borderRadius: 14,
              border: '1px solid var(--mk-ink-100)',
              background: 'white',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgb(0 0 0 / 0.04)',
            }}
          >
            {stations.map((s, i) => {
              const d = getDraft(s);
              const color = resolveColor(d.color);
              const dirty = isDirty(s);
              const isSaving = pending && pendingId === s.id;
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '4px 1fr',
                    borderBottom: i < stations.length - 1 ? '1px solid var(--mk-ink-100)' : 'none',
                    transition: 'background 120ms',
                  }}
                >
                  {/* Color accent stripe */}
                  <div style={{ background: color, transition: 'background 200ms' }} />

                  {/* Content */}
                  <div
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {/* Row 1: name + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Station code badge */}
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          flexShrink: 0,
                          background: `color-mix(in oklab, ${color} 15%, white)`,
                          border: `1.5px solid color-mix(in oklab, ${color} 30%, transparent)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          fontWeight: 800,
                          color,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {d.name.slice(0, 2).toUpperCase() || '??'}
                      </div>

                      {/* Name input */}
                      <input
                        type="text"
                        value={d.name}
                        onChange={(e) => patchDraft(s.id, { name: e.target.value })}
                        style={{
                          flex: 1,
                          height: 38,
                          padding: '0 12px',
                          fontFamily: 'var(--font-serif)',
                          fontSize: 17,
                          fontWeight: 500,
                          letterSpacing: '-0.01em',
                          color: 'var(--mk-ink-950)',
                          border: '1.5px solid transparent',
                          borderRadius: 8,
                          background: 'transparent',
                          outline: 'none',
                          transition: 'border-color 120ms, background 120ms',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'var(--mk-ink-200)';
                          e.currentTarget.style.background = 'var(--mk-canvas-50)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.background = 'transparent';
                        }}
                        aria-label="Station name"
                      />

                      {/* Sound badge */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 10px',
                          borderRadius: 99,
                          flexShrink: 0,
                          fontSize: 11.5,
                          fontWeight: 600,
                          background: d.soundEnabled ? 'var(--mk-jade-50)' : 'var(--mk-canvas-100)',
                          color: d.soundEnabled ? 'var(--mk-jade-700)' : 'var(--mk-ink-500)',
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 99,
                            flexShrink: 0,
                            background: d.soundEnabled ? 'var(--mk-jade-500)' : 'var(--mk-ink-300)',
                          }}
                        />
                        {d.soundEnabled ? 'Sound on' : 'Muted'}
                      </span>
                    </div>

                    {/* Row 2: color picker + sound toggle + actions */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
                    >
                      {/* Color swatches */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {COLOR_PRESETS.map((p) => {
                          const active = resolveColor(d.color) === p.value;
                          return (
                            <button
                              key={p.value}
                              type="button"
                              aria-label={p.label}
                              title={p.label}
                              onClick={() => patchDraft(s.id, { color: p.value })}
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                cursor: 'pointer',
                                background: p.value,
                                border: 'none',
                                boxShadow: active
                                  ? `0 0 0 2px white, 0 0 0 4px ${p.value}`
                                  : '0 0 0 1.5px oklch(0 0 0 / 0.12)',
                                transform: active ? 'scale(1.15)' : 'scale(1)',
                                transition: 'all 120ms',
                              }}
                            />
                          );
                        })}
                      </div>

                      <div
                        style={{
                          width: 1,
                          height: 16,
                          background: 'var(--mk-ink-100)',
                          flexShrink: 0,
                        }}
                      />

                      {/* Sound toggle */}
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          cursor: 'pointer',
                        }}
                      >
                        <ToggleTrack
                          on={d.soundEnabled}
                          onChange={(v) => patchDraft(s.id, { soundEnabled: v })}
                        />
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--mk-ink-600)' }}>
                          Chime on new ticket
                        </span>
                      </label>

                      <div
                        style={{
                          marginLeft: 'auto',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {dirty ? (
                          <>
                            <button
                              type="button"
                              onClick={() => discard(s)}
                              disabled={isSaving}
                              style={ghostBtn(isSaving)}
                            >
                              Discard
                            </button>
                            <button
                              type="button"
                              onClick={() => save(s)}
                              disabled={isSaving}
                              style={saveBtn(isSaving)}
                            >
                              {isSaving ? 'Saving…' : 'Save changes'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => archive(s)}
                            disabled={isSaving}
                            style={archiveBtn(isSaving)}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* How routing works callout */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            padding: '12px 16px',
            borderRadius: 10,
            background: 'var(--mk-lapis-50)',
            border: '1px solid var(--mk-lapis-100)',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--mk-lapis-500)"
            strokeWidth="1.75"
            strokeLinecap="round"
            style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }}
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--mk-lapis-700)', lineHeight: 1.6 }}>
            <strong>How routing works</strong> — Each station becomes a tab on the KDS. Menu items
            can be assigned to a specific station; unassigned items appear on all station feeds.
            Changes take effect immediately on connected KDS screens.
          </p>
        </div>
      </div>

      {/* ── Right: Add station sidebar ── */}
      <div style={{ position: 'sticky', top: 80 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          style={{
            borderRadius: 14,
            border: '1px solid var(--mk-ink-100)',
            background: 'white',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgb(0 0 0 / 0.04)',
          }}
        >
          {/* Form header */}
          <div
            style={{
              padding: '16px 20px 14px',
              borderBottom: '1px solid var(--mk-ink-100)',
              background: 'var(--mk-canvas-50)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--mk-saffron-700)',
              }}
            >
              New station
            </div>
            <h2
              style={{
                margin: '4px 0 0',
                fontFamily: 'var(--font-serif)',
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'var(--mk-ink-950)',
              }}
            >
              Add a kitchen station
            </h2>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={fieldLabel}>Station name</label>
              <input
                ref={nameInputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Grill, Bar, Pastry"
                required
                style={textInput}
              />
            </div>

            {/* Color */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={fieldLabel}>Station color</label>
              <div style={{ display: 'flex', gap: 7 }}>
                {COLOR_PRESETS.map((p) => {
                  const active = newColor === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      aria-label={p.label}
                      title={p.label}
                      onClick={() => setNewColor(p.value)}
                      style={{
                        flex: 1,
                        height: 32,
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: p.value,
                        border: 'none',
                        boxShadow: active ? `0 0 0 2px white, 0 0 0 4px ${p.value}` : 'none',
                        transform: active ? 'scale(1.08)' : 'scale(1)',
                        transition: 'all 140ms',
                      }}
                    />
                  );
                })}
              </div>
              {/* Live preview */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 9,
                  background: `color-mix(in oklab, ${resolveColor(newColor)} 10%, white)`,
                  border: `1px solid color-mix(in oklab, ${resolveColor(newColor)} 25%, transparent)`,
                  transition: 'all 200ms',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    flexShrink: 0,
                    background: resolveColor(newColor),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'white',
                    letterSpacing: '0.02em',
                  }}
                >
                  {newName.slice(0, 2).toUpperCase() || 'ST'}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mk-ink-800)' }}>
                    {newName || 'Station name'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mk-ink-400)', marginTop: 1 }}>
                    KDS tab preview
                  </div>
                </div>
              </div>
            </div>

            {/* Sound toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mk-ink-800)' }}>
                  Sound alerts
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mk-ink-400)', marginTop: 2 }}>
                  Chime when a new ticket arrives
                </div>
              </div>
              <ToggleTrack on={newSound} onChange={setNewSound} />
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={pending || !newName.trim()}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 9,
                background: pending || !newName.trim() ? 'var(--mk-ink-200)' : 'var(--mk-ink-950)',
                color: pending || !newName.trim() ? 'var(--mk-ink-500)' : 'var(--mk-canvas-50)',
                fontSize: 13.5,
                fontWeight: 700,
                border: 'none',
                cursor: pending || !newName.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 150ms',
                letterSpacing: '-0.01em',
              }}
            >
              {pending ? 'Adding…' : '+ Add station'}
            </button>
          </div>
        </form>

        {/* KDS link */}
        <a
          href="/admin/kds"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 10,
            padding: '10px',
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 500,
            color: 'var(--mk-ink-500)',
            textDecoration: 'none',
            border: '1px solid var(--mk-ink-100)',
            background: 'white',
            transition: 'color 120ms, border-color 120ms',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            style={{ width: 13, height: 13 }}
            aria-hidden
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          Open kitchen display
        </a>
      </div>
    </div>
  );
}

function ToggleTrack({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!on);
        }
      }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexShrink: 0,
        width: 40,
        height: 23,
        borderRadius: 99,
        background: on ? 'var(--mk-saffron-500)' : 'var(--mk-ink-200)',
        cursor: 'pointer',
        transition: 'background 180ms',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 19 : 3,
          width: 17,
          height: 17,
          borderRadius: 99,
          background: 'white',
          boxShadow: '0 1px 3px rgb(0 0 0 / 0.25)',
          transition: 'left 180ms',
        }}
      />
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        padding: '12px 18px',
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--mk-ink-400)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: accent ? 'var(--mk-jade-700)' : 'var(--mk-ink-950)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

const fieldLabel: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--mk-ink-500)',
};

const textInput: CSSProperties = {
  height: 38,
  width: '100%',
  padding: '0 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  border: '1.5px solid var(--mk-ink-200)',
  borderRadius: 9,
  background: 'white',
  color: 'var(--mk-ink-950)',
  outline: 'none',
  boxSizing: 'border-box',
};

function ghostBtn(disabled: boolean): CSSProperties {
  return {
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    border: '1px solid var(--mk-ink-200)',
    background: 'white',
    color: 'var(--mk-ink-500)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

function saveBtn(disabled: boolean): CSSProperties {
  return {
    height: 32,
    padding: '0 14px',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 700,
    border: '1px solid var(--mk-ink-950)',
    background: 'var(--mk-ink-950)',
    color: 'var(--mk-canvas-50)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

function archiveBtn(disabled: boolean): CSSProperties {
  return {
    height: 30,
    padding: '0 11px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid var(--mk-ink-150, var(--mk-ink-100))',
    background: 'transparent',
    color: 'var(--mk-ink-400)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
