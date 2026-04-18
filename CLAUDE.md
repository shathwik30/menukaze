# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Operating mode

This is a production multi-tenant SaaS. Behave like an owner of the codebase, not a passive assistant:

1. **Explore first.** Before editing, trace the flow end-to-end for the feature you're touching: request → validation → route handler / server action → service → Mongoose model → response. Find the existing pattern; follow it unless it's clearly wrong.
2. **Reuse before inventing.** If `@menukaze/shared`, `@menukaze/ui`, or an existing service already covers the behaviour, use it. New abstractions need a reason.
3. **Make inferences, not blockers.** When a spec is slightly ambiguous, pick the choice most consistent with the rest of the code and proceed. Only pause for clarification when the decision would change business behaviour in a way you can't ground from the code.
4. **Improve nearby code only when you're already touching it** and the improvement is safe, consistent, and small.

Keep diffs high-signal: strong types, no hardcoded strings for things that belong in `packages/shared` enums/schemas, no silent catches, no `any`, no server secrets in client modules.

## What this repo is

Menukaze is a multi-tenant "Shopify for restaurants" served at `{slug}.menukaze.com`. One signup gives a restaurant a storefront, QR dine-in ordering, a kiosk, reservations, a kitchen display, staff management, and a public API. Web-only — no native apps.

Tenancy is isolated at the data layer (every Mongoose model is tenant-scoped through a plugin in `packages/db`). Two MongoDB databases (`menukaze_live`, `menukaze_sandbox`) inside one Atlas cluster; the DB selected at runtime from the API-key prefix.

Deep context: `docs/product.md` (requirements), `docs/engineering.md` (architecture, schema, service choices), `docs/refactor-audit.md` (2026-04-15 baseline).

## Monorepo layout

pnpm workspaces + Turborepo. `pnpm-workspace.yaml` globs `apps/*`, `packages/*`, `tooling/*`.

### Apps (each a Next.js 16 App Router app; dev ports from the actual `package.json`):

| App | Port | Surface |
|---|---|---|
| `apps/dashboard` | 3000 | Operator console — menu, orders, tables, staff, KDS, analytics, settings. Mounted at `{slug}.menukaze.com/admin`. |
| `apps/storefront` | 3001 | Public restaurant site + cart + checkout + order tracking. Also hosts the public v1 API at `/api/v1/**` (Hono, Node runtime). |
| `apps/qr-dinein` | 3002 | Scan-to-order web app with multi-round sessions. `{slug}.menukaze.com/t/{qrToken}`. |
| `apps/kiosk` | 3003 | Full-screen self-serve tablet UI. |
| `apps/super-admin` | 3004 | Platform-owner console at `admin.menukaze.com`. |
| `apps/worker` | — | Long-running Fly.io Node VM running BullMQ queues (outbox drain, webhooks, emails, cron). `tsx watch src/index.ts`. |

Note: `README.md` has the dashboard/qr-dinein ports swapped — the `package.json` scripts are authoritative.

### Packages (all `workspace:*`):

- `packages/shared` — client-safe utilities: `ActionResult<T>`, cart state helpers, tax, money formatting, zod schemas, Razorpay helpers. Never imports server-only code.
- `packages/db` — Mongoose models, `getMongoConnection('live'|'sandbox')`, `getModels(conn)`, tenant-scoped plugin, envelope-encrypted field helpers. Server-only.
- `packages/auth` — BetterAuth config and Next.js handler factory.
- `packages/rbac` — roles → permission flags (`orders.view_all`, `kds.view`, `menu.edit`, …). Permission checks at every server action and route.
- `packages/tenant` — host parsing, tenant context, subdomain-routing edge middleware factory.
- `packages/realtime` — Ably channel constants + typed event payloads + `isOrderCreatedEvent` / `isOrderStatusChangedEvent` type guards.
- `packages/rate-limit` — Upstash Redis sliding-window rate limiter.
- `packages/monitoring` — `captureException`/`captureMessage` facade (Sentry + Axiom). Every app wires it via `instrumentation.ts`.
- `packages/ui` — the **"Atelier"** design system. Tailwind 4, tokens in `packages/ui/src/styles/globals.css` (import as `@menukaze/ui/styles.css`). Primitives: Button, Card, Input, Badge, Dialog, Toast, Tabs, Kbd, EmptyState. Brand: `LogoMark`, `Wordmark`, `BrandRow`, `Aurora/Mesh/GridBackdrop`, `Eyebrow`, `StatCard`. Fonts (Inter, Fraunces variable, JetBrains Mono) loaded per-app via `next/font/google` and bound to `--font-*` CSS vars on `<html>`.
- `tooling/vitest-config` — shared Vitest preset consumed by every package that has tests.

## Commands

Node 22.x, pnpm 10.x (enforced; pnpm warns on mismatch). Always use `pnpm`, never `npm` or `yarn`.

```bash
pnpm install                    # after clone
cp .env.example .env.local      # fill remote-service URLs
pnpm db:seed                    # seed demo tenant (needs MONGODB_URI)

pnpm dev                        # all apps in parallel via turbo
pnpm build                      # production build
pnpm typecheck                  # tsc --noEmit across every workspace
pnpm lint                       # ESLint, --max-warnings=0 (zero-warning policy)
pnpm lint:fix                   # auto-fix
pnpm test                       # Vitest unit, passWithNoTests per package
pnpm format / pnpm format:check
pnpm verify                     # format:check + typecheck + test + build + lint (matches CI)
```

Single-package / single-app work (much faster than the whole graph):

```bash
pnpm --filter @menukaze/dashboard dev
pnpm --filter @menukaze/db test
pnpm --filter @menukaze/dashboard --filter @menukaze/storefront run typecheck
pnpm --filter @menukaze/ui run build
```

Single-test runs use Vitest directly inside the package:

```bash
pnpm --filter @menukaze/shared exec vitest run src/tax.test.ts
pnpm --filter @menukaze/shared exec vitest run -t "calculates GST"
```

ESLint-only on touched files (fastest feedback loop):

```bash
pnpm exec eslint --max-warnings=0 path/to/file.tsx
pnpm exec prettier --check path/to/file.tsx
```

## Architecture conventions

These are the non-obvious rules that span multiple files:

### Server actions return `ActionResult<T>`
Every Server Action in every app returns `ActionResult<T>` from `@menukaze/shared` (`{ ok: true, ... } | { ok: false, code, message }`). Clients narrow on `result.ok`. Never throw out of an action unless it's truly unexpected.

### Server-only code sits on explicit subpaths
Modules that import Mongoose, BetterAuth, or BullMQ must live under a server-only subpath export from their package (e.g. `@menukaze/db` is server-only by design; `@menukaze/shared` is client-safe). If you're about to import a server-only module from a client component or from `packages/shared`, you're at the wrong layer — move the call to a server action or route handler.

### Two API surfaces: public v1 (Hono) and internal Server Actions
- **Public API** — Hono, Node runtime, mounted as `apps/storefront/src/app/api/v1/[[...path]]/route.ts`. Served as `api.menukaze.com` via Vercel rewrite. Auth via per-tenant API keys whose prefix selects `live` vs `sandbox` DB. Rate-limited; idempotency via `apps/storefront/src/app/api/v1/_lib/idempotency.ts`.
- **Internal "API"** — Next.js **Server Actions** in each operator app (`apps/dashboard/src/app/actions/*`, `apps/super-admin/src/app/actions/*`). Each action is a `'use server'` function that returns `ActionResult<T>`. Auth + RBAC run through `withRestaurantAction([...flags], handler)` / `requirePageFlag([...flags])` wrappers in `lib/action-helpers.ts` and `lib/session.ts`. No tRPC — and no `packages/api`; earlier drafts planned one but the project ships Server Actions instead.

Never cross-wire: the storefront/qr-dinein/kiosk clients call the public v1 API; dashboard and super-admin components call server actions directly.

### Data access always goes through the tenant plugin
Always resolve the tenant first (`resolveTenantOrNotFound` in each app's `lib/tenant`) and always use `getModels(conn)` — never `mongoose.model(...)` directly. Models are tenant-scoped by plugin; the plugin filters on `restaurantId` automatically.

### Realtime is server-publish-only
Server publishes to Ably via `packages/realtime` after a mutation commits (outbox drainer in the worker). Browser subscribes via a token endpoint that restricts capabilities to allowed channels (see `apps/dashboard/src/app/admin/kds/kds-board.tsx` for the canonical subscribe pattern).

### Permissions on every server action
Dashboard code guards every action/route with `requirePageFlag([...])` / `runRestaurantAction` / `runRestaurantAnyFlagAction` (`lib/action-helpers.ts`). The `run*` wrappers take `(flags, { onError, onForbidden }, handler)` and absorb the try/catch boilerplate so the handler can just `throw` or return `{ ok: false, error }`. Permission flag strings live in `packages/rbac`. When you add an action, add its flag there too.

### Design system use
Import from `@menukaze/ui`. Use CSS custom props (`var(--mk-saffron-500)`, `var(--font-serif)`) or the Tailwind tokens (`bg-canvas-50`, `text-ink-950`, `font-serif`, `mk-nums`). Don't introduce new hex codes; extend the OKLCH ramp in `packages/ui/src/styles/globals.css` instead. Sentence case everywhere. No emoji in UI.

### Root boundaries per app
Every Next app ships `error.tsx`, `global-error.tsx`, `not-found.tsx`, and `instrumentation.ts`. Unhandled errors route through `@menukaze/monitoring`. When you add a new app, copy these from an existing app first.

## Testing

- Unit: **Vitest**, one config per package (`packages/*/vitest.config.ts`) using the shared preset at `tooling/vitest-config`. Use `mongodb-memory-server` for anything that needs a real replica set (transactions).
- E2E: **Playwright** per-app projects.
- Conventions: colocated `*.test.ts` next to source. Pure logic where possible; integration tests hit real in-memory infrastructure, not mocks of Mongo/Redis.

## Git / CI

- **Conventional Commits** enforced by `.husky/commit-msg` (commitlint). Scopes are package/app names: `feat(dashboard):`, `fix(storefront):`, `refactor(ui):`, `chore:`, `docs:`.
- **Pre-commit** (`.husky/pre-commit`): lint-staged Prettier + gitleaks (if installed). CI always runs gitleaks regardless.
- **CI** (`.github/workflows/ci.yml`): mirrors `pnpm verify` + gitleaks + Playwright. Zero-warning ESLint is a hard gate.
- Prefer small, focused commits scoped by concern — the codebase is read by multiple operators and wide commits hurt bisect.

## Response template for substantive tasks

When you finish a non-trivial task, answer in this shape:

1. What you explored
2. What you found
3. What you changed (with paths)
4. Why
5. Any architectural decisions or tradeoffs
6. Risks, assumptions, follow-ups

Skip this template for trivial questions or read-only exploration.
