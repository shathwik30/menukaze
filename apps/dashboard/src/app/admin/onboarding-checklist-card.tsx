import Link from 'next/link';
import type { ChecklistSummary } from '@/lib/onboarding-checklist';
import { dismissChecklistAction } from '@/app/actions/go-live';

interface Props {
  checklist: ChecklistSummary;
}

/**
 * Post-onboarding checklist card shown on /admin until the user dismisses
 * it. Dismissal is only allowed once every *critical* item is done.
 *
 * Server component. The Dismiss button posts directly to a server action.
 */
export function OnboardingChecklistCard({ checklist }: Props) {
  return (
    <section className="border-border rounded-lg border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Setup checklist</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {checklist.doneCount} of {checklist.totalCount} complete
          </p>
        </div>
        {checklist.allCriticalDone ? (
          <form action={dismissChecklistAction}>
            <button
              type="submit"
              className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center rounded-md border px-3 text-xs"
            >
              Dismiss
            </button>
          </form>
        ) : null}
      </div>

      <div className="bg-muted mt-4 h-2 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${checklist.percent}%` }}
          aria-label={`${checklist.percent}% complete`}
        />
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {checklist.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            <span
              aria-hidden
              className={
                item.done
                  ? 'border-primary bg-primary text-primary-foreground mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px]'
                  : 'border-input text-muted-foreground mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px]'
              }
            >
              {item.done ? '✓' : ''}
            </span>
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={
                    item.done ? 'text-muted-foreground line-through' : 'text-foreground font-medium'
                  }
                >
                  {item.label}
                  {item.critical ? (
                    <span className="text-muted-foreground ml-1 text-[10px] uppercase tracking-wide">
                      required
                    </span>
                  ) : null}
                </span>
                {item.href && !item.done ? (
                  <Link href={item.href} className="text-foreground text-xs underline">
                    Finish
                  </Link>
                ) : null}
              </div>
              {item.detail ? <p className="text-muted-foreground text-xs">{item.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
