# TODO — Bugs and follow-ups found during refactor

Scope: items spotted during the 2026-04-15 refactor audit that are out of scope for the refactor itself. Treat as a triage list.

## Audit logging coverage (dashboard)

Only `apps/dashboard/src/app/actions/staff.ts` calls `logAuditEvent`. Other mutating actions (settings, menu, orders, tables, reservations, stations, webhooks, api-keys, dsar) write to the DB without emitting audit events. Super-admin by contrast logs every platform action via `logPlatformAction`.

- Audit: parity with super-admin (every mutating action writes an audit event with actor + entity + before/after).

## Rate limiting — storefront public API

`packages/shared/src/errors.ts` defines `rate_limit_exceeded` with `Retry-After` guidance, but no middleware/enforcement is wired up for `apps/storefront/src/app/api/v1/*`. Public endpoints (`/menu`, `/orders`, `/reservations`, `/restaurant`) are currently unbounded.

- Add an Upstash Redis-backed rate limiter at the route level, keyed by API key + route.

## CSRF posture

Server Actions rely on Next.js defaults. Verify same-origin enforcement is active in all apps and document the posture in CLAUDE.md once confirmed.

## Database indexes

Not reviewed exhaustively. During Phase 3g audit note any model query pattern that would benefit from a missing index here.

## `gitleaks` not locally installed

Pre-commit hook prints a warning but proceeds. Document as optional in CONTRIBUTING, or install via `pnpm dlx` at hook time.

## Inline email JSX in action files

- `apps/dashboard/src/app/actions/session-payments.tsx` — contains `CounterSessionReceiptEmailInline()` (lines 359-445).
- `apps/qr-dinein/src/app/actions/session.tsx` — contains `SessionReceiptEmailInline()` and `SessionNeedsReviewEmailInline()`.

Phase 3 will extract these into `src/emails/` files and rename the action files back to `.ts`.

## Kiosk `middleware.ts` missing HSTS + X-Frame-Options

Unlike other apps, kiosk does not set `Strict-Transport-Security` or `X-Frame-Options`. If kiosk is ever served from a non-locked-down tablet host, these should be added. Phase 2 middleware factory will normalize this and can opt kiosk in via a flag.

## Missing `loading.tsx` for async server pages

Phase 3 adds root-level `error.tsx`/`global-error.tsx`/`not-found.tsx` per app. `loading.tsx` is added selectively — some async-fetching pages would benefit (e.g., dashboard `/admin/orders`, `/admin/reservations`, storefront `/order/[id]`). Review case-by-case.

## Deferred by the 2026-04-15 refactor

### Retrofit dashboard actions to `withRestaurantAction` wrappers

`apps/dashboard/src/lib/action-helpers.ts` exports `withRestaurantAction` and `withRestaurantAnyFlagAction`, but the majority of dashboard server actions still inline `requireFlags([...])` + try/catch. Audit of `menu-admin.ts`, `orders.ts`, `settings.ts`, `staff.ts`, `tables-admin.ts`, `reservations.ts`, `stations.ts`, `webhooks.ts`, `api-keys.ts`, `dsar.ts` turned up ~25 candidates. Non-breaking change, but touches ~25 files — do as a dedicated follow-up PR so it's reviewable in isolation.

### Type-safe env with `@t3-oss/env-nextjs`

Not installed. `process.env['X']` is used throughout the apps and the worker. Adding `@t3-oss/env-nextjs` per app + `@t3-oss/env-core` in `@menukaze/db` and `apps/worker` would catch missing env vars at process boot instead of the first code path that reads them. Rollout plan:

1. Add `@t3-oss/env-nextjs` to `@menukaze/dashboard`; create `apps/dashboard/src/env.ts` that declares the (~8) vars the dashboard reads.
2. Replace `process.env['X']` in dashboard with `env.X`.
3. Repeat for the other 4 apps and the worker/db packages.

### Replace remaining `console.error` calls

`@menukaze/monitoring` now exists. Error boundaries use `captureException`. But several catch blocks across server actions still use `console.error`/`console.warn` directly. Swap them in:
- `apps/*/src/app/actions/*` (server actions)
- `apps/worker/src/*` (worker jobs)
- `apps/storefront/src/app/api/v1/*` (public API)

Mechanical refactor; one PR per app.

### Named exports in `packages/shared/src/index.ts`

Currently `export * from './<module>'` for every sub-module. Per the audit this is tree-shake-safe with the current bundler, but named exports make the public surface grep-able. Low priority.

