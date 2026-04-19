'use client';

import { Button, Checkbox, Input } from '@menukaze/ui';
import { useState, useTransition } from 'react';
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

export function StationsManager({ initial }: { initial: Station[] }) {
  const router = useRouter();
  const [stations, setStations] = useState<Station[]>(initial);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const create = (): void => {
    if (!newName.trim()) return;
    setError(null);
    start(async () => {
      const result = await createStationAction({
        name: newName.trim(),
        ...(newColor.trim() ? { color: newColor.trim() } : {}),
        soundEnabled: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStations((prev) => [
        ...prev,
        { id: result.data.id, name: newName.trim(), color: newColor.trim(), soundEnabled: true },
      ]);
      setNewName('');
      setNewColor('');
      router.refresh();
    });
  };

  const updateField = <K extends keyof Station>(id: string, key: K, value: Station[K]): void => {
    setStations((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
  };

  const save = (station: Station): void => {
    setError(null);
    setPendingId(station.id);
    start(async () => {
      const result = await updateStationAction({
        stationId: station.id,
        name: station.name,
        color: station.color,
        soundEnabled: station.soundEnabled,
      });
      if (!result.ok) setError(result.error);
      setPendingId(null);
    });
  };

  const archive = (station: Station): void => {
    setError(null);
    setPendingId(station.id);
    start(async () => {
      const result = await archiveStationAction(station.id);
      if (!result.ok) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      setStations((prev) => prev.filter((s) => s.id !== station.id));
      setPendingId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <section className="border-border space-y-3 rounded-md border p-4">
        <h2 className="text-base font-semibold">Add station</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
          <Input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Grill"
            className="border-border h-9 rounded-md border px-3 text-sm"
          />
          <Input
            type="text"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            placeholder="emerald"
            className="border-border h-9 rounded-md border px-3 text-sm"
          />
          <Button
            variant="plain"
            size="none"
            type="button"
            onClick={create}
            disabled={pending || !newName.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
          >
            Add
          </Button>
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {stations.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No stations yet. The KDS shows the full feed until you add one.
        </p>
      ) : (
        <ul className="border-border divide-border divide-y rounded-md border">
          {stations.map((s) => {
            const isPending = pending && pendingId === s.id;
            return (
              <li key={s.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_140px_auto_auto]">
                <Input
                  type="text"
                  value={s.name}
                  onChange={(e) => updateField(s.id, 'name', e.target.value)}
                  className="border-border h-9 rounded-md border px-3 text-sm"
                />
                <Input
                  type="text"
                  value={s.color}
                  onChange={(e) => updateField(s.id, 'color', e.target.value)}
                  placeholder="colour"
                  className="border-border h-9 rounded-md border px-3 text-sm"
                />
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox
                    checked={s.soundEnabled}
                    onChange={(e) => updateField(s.id, 'soundEnabled', e.target.checked)}
                  />
                  Sound
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="plain"
                    size="none"
                    type="button"
                    onClick={() => save(s)}
                    disabled={isPending}
                    className="border-border hover:bg-muted inline-flex h-8 items-center rounded-md border px-3 text-xs disabled:opacity-50"
                  >
                    Save
                  </Button>
                  <Button
                    variant="plain"
                    size="none"
                    type="button"
                    onClick={() => archive(s)}
                    disabled={isPending}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Archive
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
