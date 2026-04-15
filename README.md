# Menukaze

Multi-tenant restaurant management SaaS. Monorepo built with pnpm workspaces, Turborepo, Next.js 16, and TypeScript.

## Getting started

Requirements: Node 22.x, pnpm 10.x (both pinned — pnpm will warn on mismatch).

```bash
pnpm install
cp .env.example .env.local   # fill in the remote-service URLs
pnpm db:seed                 # seed demo tenant (needs MONGODB_URI)
pnpm dev                     # all apps in parallel
```

Remote MongoDB Atlas and Redis (Upstash or compatible) are required. There is no local Docker setup — everything runs against the same hosted services in dev and prod.

## Apps

| App | Port | Purpose |
|---|---|---|
| `apps/qr-dinein` | 3000 | In-restaurant QR → table session ordering |
| `apps/storefront` | 3001 | Customer-facing online ordering |
| `apps/dashboard` | 3002 | Restaurant operator console |
| `apps/kiosk` | 3003 | Self-service kiosk |
| `apps/super-admin` | 3004 | Platform owner console |
| `apps/worker` | — | Long-running Fly.io node (session sweeper) |

## Packages

See `CLAUDE.md` for the full dependency graph. High level:

- `packages/shared` — client-safe utilities, `ActionResult`, cart, tax, schemas.
- `packages/db` — Mongoose models, tenant-scoped plugin, envelope crypto.
- `packages/auth` — BetterAuth config + Next.js handler factory.
- `packages/rbac` — roles → permission flags.
- `packages/tenant` — host parsing, tenant context, edge-middleware factory.
- `packages/realtime` — Ably channel + event definitions.
- `packages/ui` — `cn` + shared Tailwind 4 design tokens.
- `packages/monitoring` — `captureException` / `captureMessage` facade.

## Scripts

```bash
pnpm dev              # all apps in parallel
pnpm build            # production build
pnpm lint             # ESLint, zero warnings allowed
pnpm lint:fix         # ESLint auto-fix
pnpm typecheck        # tsc --noEmit across every workspace
pnpm test             # Vitest unit tests
pnpm test:e2e         # Playwright
pnpm format           # Prettier write
pnpm format:check     # Prettier check
pnpm verify           # format:check + typecheck + test + build + lint
pnpm db:seed          # seed demo tenant data
```

Single-package runs:

```bash
pnpm --filter @menukaze/db test
pnpm --filter @menukaze/dashboard dev
```

## Pre-commit hooks

`.husky/pre-commit` runs `lint-staged` (prettier on staged files) and, if `gitleaks` is installed locally, scans the staged diff for committed secrets. Install:

```bash
# macOS
brew install gitleaks

# Ubuntu / Debian
sudo apt install gitleaks

# everyone else
go install github.com/gitleaks/gitleaks/v8@latest
```

CI runs `gitleaks` unconditionally regardless of the local install, but a local install catches secrets before they hit a commit.

`.husky/commit-msg` enforces Conventional Commits via `commitlint`.

## Conventions

- TypeScript, 2-space indent, single quotes, semicolons, kebab-case filenames (enforced via `unicorn/filename-case`).
- Conventional Commits (enforced by `commitlint` in `.husky/commit-msg`): `feat:`, `fix(scope):`, `refactor:`, `chore:`, `docs:`.
- Server-only modules live on explicit subpath exports (see `CLAUDE.md`).
- Every Server Action returns `ActionResult<T>` from `@menukaze/shared`.
- Every app has root `error.tsx`, `global-error.tsx`, and `not-found.tsx` boundaries; unhandled errors go through `@menukaze/monitoring`.

## Deeper docs

- `CLAUDE.md` — architecture, conventions, guidance for Claude Code.
- `docs/refactor-audit.md` — 2026-04-15 refactor baseline and findings.
- `docs/product.md` — product requirements.
- `docs/engineering.md` — system design.
- `docs/progress.md` — phased build log.
- `TODO.md` — deferred fixes from the refactor audit.
