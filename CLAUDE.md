# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Runtime: Node 22.x, pnpm 10.x (enforced by `engines` + `packageManager`).

```bash
pnpm dev              # all apps in parallel (Turborepo)
pnpm build            # full production build
pnpm lint             # ESLint, zero warnings allowed
pnpm typecheck        # tsc --noEmit across all workspaces
pnpm test             # Vitest unit tests across all workspaces
pnpm test:e2e         # Playwright e2e (needs remote services in .env.local)
pnpm db:seed          # seed demo tenant data (needs MONGODB_URI)
pnpm verify           # full gate: format:check + typecheck + test + build + lint
```

**Run a single package's tests:**
```bash
pnpm --filter @menukaze/db test
pnpm --filter @menukaze/shared test -- src/cart.test.ts
```

**Run one app in dev:**
```bash
pnpm --filter @menukaze/dashboard dev
```

**Environment**: copy `.env.example` → `.env.local`. Remote MongoDB Atlas and Redis (Upstash or compatible) are required — no local Docker services.

## Tests

- Unit: Vitest, colocated as `*.test.ts(x)` next to source.
- E2E: Playwright in `apps/<app>/e2e/*.spec.ts` — requires `pnpm db:seed` first.
- Both run via Turborepo, so add `--filter` to scope to one app or package.

## CI

`.github/workflows/ci.yml` runs `lint`, `format:check`, `typecheck`, `test`, `build` in parallel jobs. E2E and per-app Vercel previews run only on changed paths (via `dorny/paths-filter`). `gitleaks` scans for committed secrets. `pnpm verify` mirrors the gate locally. Lint is `--max-warnings=0`.

## Architecture

Deeper specs live in `docs/`: `product.md` (PRD), `engineering.md` (system design), `progress.md` (phased build log), `pre-launch-checklist.md`.

### Monorepo layout

| Path | Contents |
|---|---|
| `apps/dashboard` | Restaurant operator console — auth, menu, orders, tables, staff, KDS, onboarding. Port 3002. |
| `apps/storefront` | Customer-facing online ordering. Port 3001. |
| `apps/qr-dinein` | In-restaurant QR → table session ordering. Port 3000. |
| `apps/kiosk` | Self-service kiosk (scaffold, port 3003). |
| `apps/super-admin` | Platform owner console (scaffold, port 3004). |
| `apps/worker` | Long-running Node process on Fly.io. Runs the session sweeper cron. |
| `packages/db` | Mongoose models, connection pool, tenant-scoped plugin, envelope crypto. |
| `packages/auth` | BetterAuth configuration (email/password + sessions). |
| `packages/rbac` | Role → permission flag resolution. |
| `packages/realtime` | Ably channel naming and event type definitions. |
| `packages/shared` | Client-safe utilities (cart, currency, tax, validation, schemas). Server-only modules on explicit subpaths. |
| `packages/tenant` | Host parsing (`parseHost`) and tenant context loading (`loadTenantBySlug`). |
| `packages/ui` | `cn` utility + shared Tailwind CSS globals. |
| `tooling/` | Shared tsconfig, ESLint, Vitest, Playwright, Prettier configs. |

**Import rule**: `apps/*` may import `packages/*`. Packages may not import from apps. `packages/db` and `packages/shared` are leaves with zero internal dependencies.

### Multi-tenancy

Edge middleware (`apps/*/middleware.ts`) parses the `Host` header via `parseHost()` from `@menukaze/tenant/host` and stamps `x-tenant-slug` / `x-tenant-kind` / `x-tenant-host` request headers. Server components downstream call `loadTenantBySlug()` or `loadTenantByCustomDomain()` from `@menukaze/tenant` to get a `TenantContext`.

All tenant-scoped Mongoose models use the `tenantScopedPlugin` from `packages/db/src/plugins/tenant-scoped.ts`. Every query **must** include `restaurantId` or it throws `TenantContextMissingError`. Bypass only with `{ skipTenantGuard: true }` in super-admin / cron contexts.

### Dual database

MongoDB runs two databases on the same Atlas cluster: `menukaze_live` and `menukaze_sandbox` (env vars `MONGODB_DB_LIVE` / `MONGODB_DB_SANDBOX`). `getMongoConnection(dbName: 'live' | 'sandbox')` returns a memoized, pooled `Connection`. Models are registered per-connection, not globally.

### Auth and RBAC

`@menukaze/auth` wraps BetterAuth and handles identity (email/password, sessions, email verification). RBAC is separate — `@menukaze/rbac` maps `StaffMembership.role` (`owner | manager | waiter | cashier | kitchen`) to typed permission flags. Dashboard server actions call `requireSession()` and `requireFlags(...)` from `apps/dashboard/src/lib/session.ts` to gate access.

### Server actions pattern

All mutations are Next.js Server Actions in `apps/*/src/app/actions/`. They use wrappers from `action-helpers.ts` (e.g. `withRestaurantAnyFlagAction`) for auth + RBAC gating and return a typed `ActionResult<T>` discriminated union (`{ ok: true, data }` | `{ ok: false, error, code }`). Client components check `result.ok` before reading `result.data`.

### Realtime

Ably is used for live updates (order status changes, KDS board, table session state). Channel names are constructed by helpers in `@menukaze/realtime/channels`. Server publishes via `publishRealtimeEvent()` from `@menukaze/realtime/server` — called directly inside Server Actions after DB writes. Clients subscribe using Ably React hooks and the token route at `apps/*/src/app/api/ably/token/route.ts`.

### Payments

Razorpay credentials are per-restaurant, stored AES-encrypted in the `restaurants` document (`razorpayKeyIdEnc`, `razorpayKeySecretEnc`). `getRazorpayClientFromEncryptedKeys()` from `@menukaze/shared/razorpay` decrypts them JIT using `envelopeDecrypt` from `@menukaze/db`. `ENCRYPTION_KEY` must be set in env.

### Worker

The worker (`apps/worker`) is a plain Node.js process deployed to Fly.io (not a Next.js app). It currently runs one job: `sweepTimedOutSessions()` on a configurable interval (`WORKER_SESSION_SWEEP_INTERVAL_MS`, default 60 s). Email sending and realtime publishing happen inline in Server Actions, not via queues.

### Subpath exports

Several packages expose server-only code on explicit subpaths to avoid bundling server modules into client code:
- `@menukaze/shared/razorpay` — Razorpay client factory
- `@menukaze/shared/transactional-email` — Resend-based email sender
- `@menukaze/db/object-id` — ObjectId parse/validate helpers
- `@menukaze/tenant/host` — `parseHost` (edge-safe, no DB)
- `@menukaze/tenant/request` — request-level tenant loading

## Conventions

- TypeScript, 2-space indent, single quotes, semicolons, kebab-case filenames.
- Commits follow Conventional Commits (`feat:`, `fix(scope):`, `chore(audit):`); reference phase/step where applicable (e.g. `feat: phase 4 step 21 multi-round ordering`).
- Server-only modules must live on a subpath export (see list above) — never re-export from a package root that client code consumes.
