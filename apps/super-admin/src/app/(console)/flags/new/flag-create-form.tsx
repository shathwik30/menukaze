'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createFlagAction } from '@/app/actions/flags';

export function FlagCreateForm() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createFlagAction({ key, label, description });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push('/flags');
    router.refresh();
  }

  const inputClass =
    'border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2';

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Key</span>
        <input
          type="text"
          required
          maxLength={120}
          pattern="[a-z0-9_]+"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="kiosk_mode"
          className={inputClass}
        />
        <span className="text-muted-foreground mt-1 block text-xs">
          Lowercase letters, numbers, and underscores only.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Display name</span>
        <input
          type="text"
          required
          maxLength={200}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Kiosk Mode"
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Description (optional)</span>
        <textarea
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputClass}
        />
      </label>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-6 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? 'Creating...' : 'Create Flag'}
      </button>
    </form>
  );
}
