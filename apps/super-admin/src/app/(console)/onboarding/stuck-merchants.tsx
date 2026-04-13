'use client';

import Link from 'next/link';

interface StuckMerchant {
  id: string;
  name: string;
  slug: string;
  onboardingStep: string;
  createdAt: string;
  daysStuck: number;
}

export function StuckMerchants({ merchants }: { merchants: StuckMerchant[] }) {
  if (merchants.length === 0) {
    return <p className="text-muted-foreground text-sm">No stuck merchants.</p>;
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border bg-muted/50 border-b text-left">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Slug</th>
            <th className="px-4 py-3 font-medium">Stuck On</th>
            <th className="px-4 py-3 font-medium">Signed Up</th>
            <th className="px-4 py-3 text-right font-medium">Days Stuck</th>
          </tr>
        </thead>
        <tbody>
          {merchants.map((m) => (
            <tr key={m.id} className="border-border hover:bg-muted/30 border-b last:border-0">
              <td className="px-4 py-3">
                <Link href={`/merchants/${m.id}`} className="font-medium hover:underline">
                  {m.name}
                </Link>
              </td>
              <td className="text-muted-foreground px-4 py-3 font-mono text-xs">{m.slug}</td>
              <td className="px-4 py-3 text-xs">{m.onboardingStep}</td>
              <td className="text-muted-foreground px-4 py-3 text-xs">
                {new Date(m.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={m.daysStuck > 30 ? 'font-medium text-red-600' : ''}>
                  {m.daysStuck}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
