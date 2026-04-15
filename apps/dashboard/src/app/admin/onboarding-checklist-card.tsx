import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from '@menukaze/ui';
import type { ChecklistSummary } from '@/lib/onboarding-checklist';
import { dismissChecklistFormAction } from '@/app/actions/go-live';

interface Props {
  checklist: ChecklistSummary;
}

export function OnboardingChecklistCard({ checklist }: Props) {
  return (
    <Card variant="surface" radius="lg" className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 40% 80% at 0% 0%, oklch(0.885 0.100 68 / 0.12), transparent 60%)',
        }}
      />
      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="accent" size="sm" shape="pill">
                Setup
              </Badge>
              <span className="text-ink-500 dark:text-ink-400 text-xs">
                {checklist.doneCount} of {checklist.totalCount} complete
              </span>
            </div>
            <CardTitle className="mt-2 font-serif text-2xl">
              Finish setting up{' '}
              {checklist.doneCount === checklist.totalCount
                ? '— you\u2019re done!'
                : 'your restaurant'}
            </CardTitle>
            <CardDescription>
              A few quick steps to unlock everything Menukaze can do.
            </CardDescription>
          </div>
          {checklist.allCriticalDone ? (
            <form action={dismissChecklistFormAction}>
              <Button type="submit" variant="ghost" size="sm">
                Dismiss
              </Button>
            </form>
          ) : null}
        </div>

        <div className="bg-ink-100 dark:bg-ink-800 mt-5 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="from-saffron-400 to-saffron-600 h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out"
            style={{ width: `${checklist.percent}%` }}
            aria-label={`${checklist.percent}% complete`}
          />
        </div>
      </CardHeader>

      <CardContent className="relative">
        <ul className="grid gap-2 sm:grid-cols-2">
          {checklist.items.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                item.done
                  ? 'border-jade-200 bg-jade-50/50 dark:border-jade-500/20 dark:bg-jade-500/10'
                  : 'border-ink-100 bg-canvas-50 hover:bg-canvas-100 dark:border-ink-800 dark:bg-ink-900/60 dark:hover:bg-ink-900',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                  item.done
                    ? 'bg-jade-500 text-white'
                    : 'border-ink-300 text-ink-400 dark:border-ink-600 dark:text-ink-500 border border-dashed',
                )}
              >
                {item.done ? (
                  <svg
                    viewBox="0 0 12 12"
                    className="size-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="2 6 5 9 10 3" />
                  </svg>
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      item.done ? 'text-ink-500 dark:text-ink-400 line-through' : 'text-foreground',
                    )}
                  >
                    {item.label}
                  </p>
                  {item.critical ? (
                    <Badge variant="outline" size="xs" shape="pill">
                      Required
                    </Badge>
                  ) : null}
                </div>
                {item.detail ? (
                  <p className="text-ink-500 dark:text-ink-400 mt-0.5 text-[11.5px] leading-relaxed">
                    {item.detail}
                  </p>
                ) : null}
                {item.href && !item.done ? (
                  <Link
                    href={item.href}
                    className="text-saffron-700 dark:text-saffron-400 mt-1 inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                  >
                    Finish this step
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3"
                      aria-hidden
                    >
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
