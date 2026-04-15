# TODO — Bugs and follow-ups found during refactor

Scope: items spotted during the 2026-04-15 refactor audit that are out of scope for the refactor itself. Treat as a triage list.

## Audit logging coverage (dashboard)

Recent coverage exists for staff, API keys, webhooks, DSAR, order status, session payments, Razorpay connect, go-live, selected menu item mutations, and selected settings updates. Coverage is still incomplete across remaining mutating dashboard actions, especially onboarding starter/advance actions, table admin, reservations, stations, walk-in/POS, checklist dismissal, webhook test/retry, and unlogged settings/menu/category updates. Super-admin by contrast logs every platform action via `logPlatformAction`.

- Audit: parity with super-admin (every mutating action writes an audit event with actor + entity + before/after).

## Database indexes

Not reviewed exhaustively. A focused pass should read each Mongoose schema's `.index()` declarations against the tenant-scoped query patterns in the matching action files and note any missing indexes.

## Missing `loading.tsx` for async server pages

Phase 3 added root-level `error.tsx` / `global-error.tsx` / `not-found.tsx` per app but deferred segment-level `loading.tsx`. Async-fetching pages that would benefit: dashboard `/admin/orders`, `/admin/reservations`, storefront `/order/[id]`, super-admin `/merchants`. Review case-by-case — blanket skeletons can cause flashes on fast pages.

## GitHub Actions Node 20 deprecation

CI uses `actions/checkout@v4`, `pnpm/action-setup@v4`, `dorny/paths-filter@v3`, `gitleaks/gitleaks-action@v2`, `actions/setup-node@v4`, `actions/cache@v4`, `actions/upload-artifact@v4`. All run on Node 20. GitHub forces Node 24 on 2026-06-02. Bump to versions that ship Node 24 runners before then (most major-version bumps or minor-version upgrades available now).

## Deferred by the 2026-04-15 refactor

### Type-safe env in `@menukaze/db`

Apps and `apps/worker` now use `@t3-oss/env-nextjs` / `@t3-oss/env-core` for boot-time validation. The remaining direct env reads are in `packages/db/src/client.ts`, `packages/db/src/crypto.ts`, and `packages/db/scripts/seed.ts`. Decide whether to introduce `@t3-oss/env-core` in `@menukaze/db` or keep package-level runtime reads because the package is consumed by multiple apps with their own env validation.

### Named exports in `packages/shared/src/index.ts` (declined)

Evaluated 2026-04-15 and declined: ~150 public symbols across 15 modules. Wildcards are tree-shake-safe under Next.js + Turborepo's ESM pipeline, and enumerating the surface adds maintenance burden (every new export touches index.ts) for marginal grep-ability. Revisit if a future rule (e.g. `no-wildcard-re-exports`) lands in the shared ESLint config.
