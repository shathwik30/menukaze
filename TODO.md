# TODO — Bugs and follow-ups found during refactor

Scope: items spotted during the 2026-04-15 refactor audit that are out of scope for the refactor itself. Treat as a triage list.

## Audit logging coverage (dashboard)

Only `apps/dashboard/src/app/actions/staff.ts` calls `logAuditEvent`. Other mutating actions (settings, menu, orders, tables, reservations, stations, webhooks, api-keys, dsar) write to the DB without emitting audit events. Super-admin by contrast logs every platform action via `logPlatformAction`.

- Audit: parity with super-admin (every mutating action writes an audit event with actor + entity + before/after).

## Rate limiting — storefront public API

`packages/shared/src/errors.ts` defines `rate_limit_exceeded` with `Retry-After` guidance, but no middleware/enforcement is wired up for `apps/storefront/src/app/api/v1/*`. Public endpoints (`/menu`, `/orders`, `/reservations`, `/restaurant`) are currently unbounded.

- Add an Upstash Redis-backed rate limiter at the route level, keyed by API key + route.

## Database indexes

Not reviewed exhaustively. A focused pass should read each Mongoose schema's `.index()` declarations against the tenant-scoped query patterns in the matching action files and note any missing indexes.

## Missing `loading.tsx` for async server pages

Phase 3 added root-level `error.tsx` / `global-error.tsx` / `not-found.tsx` per app but deferred segment-level `loading.tsx`. Async-fetching pages that would benefit: dashboard `/admin/orders`, `/admin/reservations`, storefront `/order/[id]`, super-admin `/merchants`. Review case-by-case — blanket skeletons can cause flashes on fast pages.

## GitHub Actions Node 20 deprecation

CI uses `actions/checkout@v4`, `pnpm/action-setup@v4`, `dorny/paths-filter@v3`, `gitleaks/gitleaks-action@v2`, `actions/setup-node@v4`, `actions/cache@v4`, `actions/upload-artifact@v4`. All run on Node 20. GitHub forces Node 24 on 2026-06-02. Bump to versions that ship Node 24 runners before then (most major-version bumps or minor-version upgrades available now).

## Deferred by the 2026-04-15 refactor

### Type-safe env with `@t3-oss/env-nextjs`

Not installed. `process.env['X']` is used throughout the apps and the worker. Adding `@t3-oss/env-nextjs` per app + `@t3-oss/env-core` in `@menukaze/db` and `apps/worker` would catch missing env vars at process boot instead of the first code path that reads them. Rollout plan:

1. Add `@t3-oss/env-nextjs` to `@menukaze/dashboard`; create `apps/dashboard/src/env.ts` that declares the (~8) vars the dashboard reads.
2. Replace `process.env['X']` in dashboard with `env.X`.
3. Repeat for the other 4 apps and the worker/db packages.

### Named exports in `packages/shared/src/index.ts` (declined)

Evaluated 2026-04-15 and declined: ~150 public symbols across 15 modules. Wildcards are tree-shake-safe under Next.js + Turborepo's ESM pipeline, and enumerating the surface adds maintenance burden (every new export touches index.ts) for marginal grep-ability. Revisit if a future rule (e.g. `no-wildcard-re-exports`) lands in the shared ESLint config.

