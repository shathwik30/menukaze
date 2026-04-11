'use client';

import { useState } from 'react';
import { useCart } from '@/stores/cart';

interface Props {
  itemId: string;
  name: string;
  priceMinor: number;
  disabled?: boolean;
}

export function AddToCartButton({ itemId, name, priceMinor, disabled }: Props) {
  const addLine = useCart((s) => s.addLine);
  const [justAdded, setJustAdded] = useState(false);

  if (disabled) {
    return (
      <span className="text-muted-foreground text-xs uppercase tracking-wide">Unavailable</span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        addLine({ itemId, name, priceMinor, modifiers: [] });
        setJustAdded(true);
        window.setTimeout(() => setJustAdded(false), 1200);
      }}
      className="border-input hover:bg-accent hover:text-accent-foreground shrink-0 rounded-md border px-3 py-1 text-xs font-medium"
      aria-label={`Add ${name} to cart`}
    >
      {justAdded ? 'Added ✓' : 'Add'}
    </button>
  );
}
