# Refactor Audit — Menukaze Monorepo

Date: 2026-04-15
Baseline commit: `edff702` (feat: checkpoint multi-feature WIP before refactor)

This audit was produced before touching any code. It documents:

1. How the pasted refactor prompt conflicts with current conventions (and which items to skip).
2. Real duplication worth extracting.
3. Inconsistencies worth normalizing.
4. Tooling gaps.
5. Things already well-factored — don't touch.

Findings are cited to file/line where applicable. Scope: everything the pasted prompt covers, read against the actual repo state.

---

## 1. Conflicts with the pasted prompt — items to SKIP

These items in the prompt would either break callers or contradict decisions already documented in `CLAUDE.md`. They are excluded from the refactor plan.

| Prompt item | Current state | Decision |
|---|---|---|
| Phase 3a: rename `ActionResult.ok` → `ActionResult.success` | `action-helpers.ts` in dashboard (line 7-14) and super-admin (line 6-13) define `{ ok: true, data } \| { ok: false, error }`. 30+ action files import this. Hundreds of `result.ok` / `!result.ok` checks across client components. CLAUDE.md line 84 documents the shape. | **Skip.** Breaking change for zero business benefit. |
| Phase 3a: replace shared error registry with `AppError`/`NotFoundError`/`UnauthorizedError` subclasses | `packages/shared/src/errors.ts` already has `APIError` + `ERROR_CODES` registry (17 codes with status + default messages) and `ErrorEnvelope` type. CLAUDE.md ties this to the Hono/tRPC API envelope. Subclass approach would regress to string-matched codes. | **Skip.** Current system is tighter and already unified. |
| Phase 3a: introduce `ok(data)` / `err(msg)` factory helpers | Current pattern uses inline `{ ok: true, data }` plus named helpers `validationError()`, `invalidEntityError()`, `actionError()`. More explicit than a generic `err('...')`. | **Skip.** Extract the existing helpers (see §2.5) but don't add new shorthand. |
| Phase 1a: `engines.node` set to `>=20` | Root `package.json` pins `"node": "22.x"`. CLAUDE.md line 7 says Node 22.x. Turborepo pipeline and CI assume 22.x. | **Skip.** Keep `22.x`. |
| Phase 1f: rename script `typecheck` → `type-check` | Existing root script is `typecheck`. Called by `pnpm verify` and `.github/workflows/ci.yml`. CLAUDE.md line 13 documents `pnpm typecheck`. | **Skip.** Keep `typecheck`. |
| Phase 4a: `pnpm add date-fns --filter @menukaze/shared` | No `date-fns`/`dayjs`/`luxon` currently installed anywhere in workspace. Timestamps use raw `Date` + `Intl.DateTimeFormat`. Shared `session-timeout.ts` and `menu-schedule.ts` do narrow computations with bare `Date` that don't benefit from a library. | **Defer.** Revisit only if a date operation in later phases is genuinely ergonomic with a library. |
| Phase 2f/2g: "create packages/realtime" / "extract into packages/auth" | Both packages already exist. `packages/realtime` exports channel helpers + event guards; `packages/realtime/src/server.ts` has `createAblyTokenRequest`. `packages/auth` exports `createAuth` + `AuthInstance`. | **Don't create — extend.** See §2 for what's missing. |
| Phase 2d: "extract tenant resolution into packages/tenant" | `packages/tenant` already exports everything: `parseHost`, `loadTenantBySlug`, `loadTenantByCustomDomain`, `getTenantLocator`, `loadTenantRestaurantFromHeaders`. Only app-local wrappers (kiosk, storefront) remain, and kiosk's has legitimate env-fallback logic. | **Skip the major extraction.** Leave local wrappers. |
| Phase 3e: rename all `.tsx` action files to `.ts` | `apps/dashboard/src/app/actions/session-payments.tsx` (lines 359-445) and `apps/qr-dinein/src/app/actions/session.tsx` contain inline email JSX (React components used with `render()` for transactional email). They legitimately return JSX. | **Don't rename.** Address differently in Phase 3: extract the inline email components into `emails/` and rename the action file only if the JSX goes away. |
| Phase 6b: rewrite `CLAUDE.md` from scratch | CLAUDE.md was just refreshed in commit `da7320b` (5 commits ago) and is accurate for the pre-refactor state. | **Update surgically** in Phase 6 — don't start over. |
| Phase 7.1: "delete node_modules and pnpm-lock.yaml, run pnpm install" | pnpm-lock.yaml is committed. Deleting it produces a large lockfile churn and risks dep version drift. | **Skip the delete.** Run `pnpm install --frozen-lockfile` to verify resolvability without disturbing the lockfile. |

---

## 2. Real duplication worth extracting

### 2.1 BetterAuth catch-all handler (HIGHEST CONFIDENCE)

Two files are byte-near-identical:

- `apps/dashboard/src/app/api/auth/[...all]/route.ts` (34 lines)
- `apps/super-admin/src/app/api/auth/[...all]/route.ts` (27 lines)

Both: set `runtime = 'nodejs'`, cache a lazy BetterAuth handler, forward GET/POST. Zero app-specific variance.

`packages/auth/src/index.ts` only exports `{ createAuth, type AuthInstance }` — no Next.js handler wrapper.

**Plan:** Add `createBetterAuthRouteHandler(getAuth)` to `packages/auth/src/next.ts` (subpath to keep the core import Next-free). Each app's route becomes:

```ts
export { GET, POST, runtime } from '@menukaze/auth/next';
```

Or, if each app needs its own `getAuth` factory:

```ts
import { createBetterAuthRouteHandler } from '@menukaze/auth/next';
import { getAuth } from '@/lib/auth';
export const { GET, POST } = createBetterAuthRouteHandler(getAuth);
export const runtime = 'nodejs';
```

Saves ~55 lines; removes cache-init drift risk.

### 2.2 Edge middleware (5 apps, ~80% similarity)

All 5 Next.js apps have `middleware.ts` files with near-identical structure (parse host → stamp tenant headers → generate nonce → set CSP + security headers).

| App | Tenant parse | HSTS | X-Frame-Options | CSP variants |
|---|---|---|---|---|
| dashboard | yes | yes | DENY | baseline |
| storefront | yes | yes | DENY | baseline + robots/sitemap matcher |
| qr-dinein | yes | yes | DENY | baseline |
| kiosk | yes | **no** | **no** | Razorpay hosts added |
| super-admin | **no** | yes | DENY | connect-src `'self'` only |

**Plan:** Add `createTenantMiddleware(options)` to `packages/tenant/src/middleware.ts` (new file) with options for:

- `parseTenantHeaders: boolean` (default true; super-admin sets false)
- `cspOverrides: Partial<Record<Directive, string>>` (kiosk adds Razorpay hosts)
- `extraSecurityHeaders: boolean` (kiosk sets false)
- `matcherExtras: string[]` (storefront excludes robots.txt, sitemap.xml)

Each app's `middleware.ts` collapses to 4-8 lines. Saves ~150 lines across 5 apps.

### 2.3 Cart stores (3 apps, ~40 lines duplicated)

Already-shared pure functions in `packages/shared/src/cart.ts`: `addCartLine`, `incrementCartLine`, `decrementCartLine`, `removeCartLine`, `setCartLineNotes`, etc.

Duplication lives in the Zustand glue. All three stores repeat:

```ts
addLine: (input) => set({ lines: addCartLine(get().lines, input) }),
incrementLine: (key) => set({ lines: incrementCartLine(get().lines, key) }),
decrementLine: (key) => set({ lines: decrementCartLine(get().lines, key) }),
removeLine: (key) => set({ lines: removeCartLine(get().lines, key) }),
```

Kiosk and storefront also duplicate a `setRestaurant()` guard (reset cart on tenant switch).

**Plan:** Add `createBaseCartStore(config)` to `packages/shared/src/cart-store.ts` (new file). Per-app stores add only:

- kiosk: `orderMode` field + `setOrderMode`
- qr-dinein: nothing (base is sufficient)
- storefront: wrap with `persist()` middleware

Saves ~40 lines, unifies line-mutation semantics.

### 2.4 Ably token routes (PARTIAL extraction)

Four routes (`dashboard`, `storefront`, `kiosk`, `qr-dinein`) all call `createAblyTokenRequest` from `@menukaze/realtime/server`. But the auth/resolution logic differs too much for a single factory:

- **dashboard**: staff session → multi-channel capability (`restaurant.{id}.*`).
- **storefront**, **kiosk**: customer subscribe-only, scoped by orderId lookup.
- **qr-dinein**: customer subscribe-only, scoped by session `_id` lookup (no tenant guard).

**Plan:** Do NOT force a single factory. Instead:

1. Re-export `createAblyTokenRequest` + `publishRealtimeEvent` from `@menukaze/realtime/server` → `@menukaze/realtime` index (fewer subpath imports). Currently only `channels` + events are in index.
2. Extract a small utility `scopedSubscribeTokenForResource({ capabilityChannel, clientId })` for the 3 customer routes. Dashboard stays bespoke.

Moderate confidence. Saves ~20 lines + consistent error shape across the 3 customer routes.

### 2.5 Action helpers — validation helpers are verbatim duplicates

Dashboard `action-helpers.ts` (62 lines) and super-admin `action-helpers.ts` (46 lines) share three identical functions:

- `validationError(error: ZodError, fallback)` — identical
- `invalidEntityError(entity)` — identical
- `ActionResult<T>` + `ActionFailure` types — identical

They diverge on:

- `actionError()` — dashboard adds `permissionMessage` param for `PermissionDeniedError`.
- Restaurant wrappers (`withRestaurantAction`, `withRestaurantAnyFlagAction`) — dashboard only.
- `withSuperAdminAction` — super-admin only, pulls IP + user-agent headers.

**Plan:** Add `packages/shared/src/action-result.ts` exporting:

- `ActionFailure`, `ActionResult<T>` types
- `validationError`, `invalidEntityError`, `actionError` (with optional permission-denied check via a passed-in predicate to avoid importing `PermissionDeniedError` into `shared`)

Each app's `action-helpers.ts` keeps the app-specific wrappers and re-exports the shared types/helpers. Saves ~30 lines + eliminates drift on error-shape semantics.

### 2.6 Email layouts — extract `EmailShell` / `emailStyles`

`apps/storefront/src/emails/shared.tsx` has a reusable `EmailShell` wrapper + 8 style objects. Dashboard emails (`staff-invite.tsx`, `order-ready.tsx`) use inline styles and reinvent the same layout patterns.

**Plan:** Extract to `packages/email/` (new package, scoped to `@menukaze/email`). Install `@react-email/components` there; re-export `EmailShell`, `emailStyles`. Dashboard emails switch to the shared layout.

Confidence: medium. Only worth doing if we also migrate the dashboard emails to use it — otherwise the abstraction is unused.

### 2.7 Extracted helpers that DO NOT need doing

- **Audit logging**: `packages/db/src/models/audit-log.ts` + `packages/db/src/models/platform-audit-log.ts` are separate models with different shapes. The dashboard `lib/audit.ts` writes tenant audit; super-admin writes platform audit via `logPlatformAction`. Shapes diverge enough that a generic factory buys little. Leave as-is.
- **Tenant resolution**: Already fully factored. Kiosk's local `tenant.ts` adds an env-based fallback that's legitimately kiosk-specific (headless operation).
- **CSS globals**: Already deduplicated — every app's `globals.css` only `@import '@menukaze/ui/styles.css'`. Kiosk adds intentional overrides. No change.
- **`packages/shared/src/tax.ts` vs `apps/kiosk/src/lib/tax-rules.ts`**: Kiosk's file is a `TaxRuleLike` → `TaxRule` serializer (transform layer), not a duplication of the compute function. Keep.
- **postcss.config.mjs**: All 5 apps have a 3-line `@tailwindcss/postcss` setup. Extracting a shared config saves 2 lines per app; not worth a new tooling package.
- **next.config.ts**: Variance is real (auth/rbac in `transpilePackages` for admin apps only; different `allowedDevOrigins`). A shared factory helps marginally but introduces a configuration abstraction layer for ~10 lines of savings. Defer.

---

## 3. Inconsistencies worth normalizing (Phase 3, non-breaking)

### 3.1 Missing Next.js boundary files

| App | `loading.tsx` | `error.tsx` | `global-error.tsx` | `not-found.tsx` |
|---|---|---|---|---|
| dashboard | ✗ | ✗ | ✗ | ✗ |
| storefront | ✗ | ✗ | ✗ | ✓ |
| kiosk | ✗ | ✗ | ✗ | ✗ |
| qr-dinein | ✗ | ✗ | ✗ | ✗ |
| super-admin | ✗ | ✗ | ✗ | ✗ |

Add root-level `error.tsx` + `global-error.tsx` + `not-found.tsx` to each app. Add `loading.tsx` only to pages that do async fetching on the server component level (not blanket everywhere — a blanket `loading.tsx` can add unwanted skeleton flashes for fast pages).

### 3.2 `withRestaurantAction` wrappers are defined but underused

Dashboard's `action-helpers.ts` exports `withRestaurantAction` and `withRestaurantAnyFlagAction` but most dashboard action files (`menu.ts`, `orders.ts`, `settings.ts`, `staff.ts`, etc.) instead manually:

```ts
const ctx = await requireFlags(['menu.edit']);
try { ... } catch (e) { return actionError(e, '...'); }
```

Retrofit to use the wrapper — eliminates ~5 lines per action × ~25 actions.

### 3.3 `.tsx` action files contain inline email JSX

- `apps/dashboard/src/app/actions/session-payments.tsx` → `CounterSessionReceiptEmailInline()` (JSX lines 359-445)
- `apps/qr-dinein/src/app/actions/session.tsx` → `SessionReceiptEmailInline()`, `SessionNeedsReviewEmailInline()`

Plan: move each inline email component into the app's `src/emails/` directory as its own file. Rename the action file back to `.ts`. Matches the storefront pattern (emails live in `emails/`, actions import `render()` + the template).

### 3.4 `src/hooks/` only in kiosk

Only `apps/kiosk/src/hooks/` exists (`use-idle-reset.ts`, `use-pin-exit.ts`). Other apps either have no hooks or scatter them inline under `_components/`. Not a bug but inconsistent.

Plan: when a hook is found inline during later phases, move it to `src/hooks/<app>`. Don't do a blanket sweep.

### 3.5 Storefront v1 API: success shape has mild drift

All error responses use `{ error: { code, message, status } }` consistently (via `apiError()` in `_lib/auth.ts`).

Success responses differ by route:
- `/menu` → bare `{ menus, categories, items }`
- `/orders` POST → bare `{ id, public_order_id, ... }`
- `/restaurant` → bare `{ id, slug, name, ... }`

None wrap in `{ data }`. This is actually consistent *as bare JSON*; the "drift" is only that the prompt expects `{ data: ... }`. Public API consumers may depend on the bare shape.

**Decision:** Keep bare JSON. Do not add a `{ data }` wrapper — would break any external integrations. Document the envelope in `packages/shared/src/errors.ts` (already half-done).

### 3.6 Server action input validation — mostly good, a few gaps

Sample showed:
- `staff.ts`, `reservations.ts`, `settings.ts` — Zod-validate at top. ✓
- `menu.ts` (some paths) — throws raw in transactional code without `.safeParse`. Minor.
- `storefront/actions/reservation.ts`, `kiosk.ts`, `qr-dinein/session.tsx` — Zod at top. ✓

Plan: spot-fix actions that don't currently `.safeParse` at entry. Low risk.

### 3.7 Audit logging adoption uneven

Super-admin calls `logPlatformAction()` on every mutation. Dashboard only calls `logAuditEvent()` in `staff.ts` (3 places). Other dashboard actions (settings changes, menu edits, table operations) are silent.

Plan: defer to a later pass — not part of this refactor. Add to TODO.md.

---

## 4. Tooling gaps (Phase 1)

Already in place:
- Husky (v9.1.7) with `.husky/pre-commit` running `lint-staged` with `prettier --write`.
- `lint-staged` (v15.5.2) configured in `.lintstagedrc.json`.
- Prettier (v3.8.2) with `.prettierrc.cjs` + `.prettierignore`.
- Strict TypeScript (`tooling/tsconfig/base.json` already has `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch` — stricter than the prompt's proposal).
- ESLint with `typescript-eslint.configs.recommendedTypeChecked` (flat config, v9.39.4) + `unicorn/filename-case` enforcing kebab-case.
- Turborepo pipeline with `build`, `dev`, `lint`, `typecheck`, `test`, `test:e2e`, `clean` defined.
- Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `format`, `format:check`, `verify`, `clean`, `db:seed`, `prepare`.

Gaps to fill:
1. **No commitlint.** Add `@commitlint/cli` + `@commitlint/config-conventional` + `.husky/commit-msg`.
2. **No `.vscode/settings.json` / `extensions.json`.** Add with `editor.formatOnSave`, ESLint auto-fix, Tailwind extension hint.
3. **No per-app `.env.example`.** Root has `.env.example`. Each Next.js app should have its own for Vercel per-project env var discovery.
4. **No `pnpm lint:fix` script.** Add (prompt's Phase 1f lists it; easy win).

---

## 5. Packages to consider adding (Phase 4)

| Package | Currently in repo? | Recommendation |
|---|---|---|
| `@t3-oss/env-nextjs` / `@t3-oss/env-core` | No | **Add.** `process.env['X']` is ubiquitous. Type-safe env catches missing vars at boot. Low risk, high value. |
| `react-hook-form` + `@hookform/resolvers` | No | **Hold.** Most admin forms appear to use Server Actions + native form state. Audit forms first before installing; may not be needed. |
| `@sentry/*` or a monitoring wrapper | No | **Defer to a thin `packages/monitoring` facade.** Wrap `console.error` / `console.warn` behind `captureException` / `captureMessage` so Sentry integration later is a one-line swap. |
| `date-fns` | No | **Skip.** Current date usage is narrow; importing a library for a handful of ops adds surface area with no clear benefit. Reconsider if/when recurring schedule logic expands. |
| `next-safe-action` | No | **Skip.** The existing `withRestaurantAction` pattern + `ActionResult` shape already covers what `next-safe-action` provides; migration cost outweighs benefit. |

---

## 6. Already well-factored — don't touch

- `tooling/tsconfig/{base,nextjs,node,react}.json` — clean inheritance, all apps use `nextjs`, all non-Next packages use `node` or `base`.
- `tooling/vitest-config/node.js` — factory (`createNodeVitestConfig`), cleanly consumed by all apps.
- `tooling/playwright-config/index.js` — factory (`createPlaywrightConfig`), all apps pass port + command + optional headers.
- `tooling/eslint-config/base.js` — flat config with type-checked rules, unicorn kebab-case, caught-errors-none.
- `tooling/prettier-config/` — shared Prettier config consumed via `prettier-config` export field.
- `packages/tenant` — already exposes everything (`parseHost`, `loadTenantBySlug`, `loadTenantByCustomDomain`, `getTenantLocator`, `loadTenantRestaurantFromHeaders`).
- `packages/shared/src/errors.ts` — `APIError` + `ERROR_CODES` + `ErrorEnvelope` covers the public API contract cleanly.
- `packages/shared/src/tax.ts` — `computeTax()` handles inclusive/exclusive + multi-rule correctly with integer minor units.
- `packages/shared/src/cart.ts` — pure cart mutation functions, well-tested shape.
- `packages/ui/src/styles/globals.css` — Tailwind 4 `@theme` block + CSS variable design system, consumed by all apps.

---

## 7. Dependency versions (spot-checked)

- Node: 22.x (pinned)
- pnpm: 10.33.0 (pinned in `packageManager`)
- Turbo: 2.9.6
- TypeScript: 5.9.3
- ESLint: 9.39.4 (flat config)
- Prettier: 3.8.2
- Husky: 9.1.7
- lint-staged: 15.5.2
- `@react-email/render`: 1.0.3 (both dashboard + storefront — matching)
- `@axe-core/playwright`: 4.10.2 (a11y tests)
- `@playwright/test`: 1.55.1

No obvious version drift between apps. Package.json files use `workspace:*` for internal deps (per CLAUDE.md convention).

---

## 8. Bugs/issues to note (will move to TODO.md, not fix this refactor)

- Dashboard audit logging coverage is sparse (only `staff.ts` writes audit events; settings/menu/orders/tables/reservations do not).
- Rate limiting: unclear if storefront `/api/v1/*` endpoints are rate-limited — the code uses `ERROR_CODES.rate_limit_exceeded` but no middleware enforces it in-tree.
- No explicit CSRF strategy documented — Server Actions rely on Next.js defaults. Verify same-origin is enforced.
- `gitleaks` runs in CI but not locally (pre-commit warned it's not installed). Consider documenting as optional.
- `process.env['X']` (bracket notation) is used instead of typed env — flagged for Phase 4 replacement via `@t3-oss/env`.
- Several `console.error` calls in catch blocks across server actions. To be wrapped after `packages/monitoring` lands.

---

## 9. Execution plan per phase

### Phase 1 — Tooling hygiene
- Add `@commitlint/cli` + `@commitlint/config-conventional` (devDep at root).
- Add `commitlint.config.js` + `.husky/commit-msg` running `commitlint --edit $1`.
- Add `.vscode/settings.json` (format-on-save, eslint auto-fix) + `extensions.json` (prettier, eslint, tailwind).
- Add `lint:fix` script at root.
- **Skip** `type-check` rename, `engines >= 20`, strict-tsconfig edits (already stricter than prompt).

### Phase 2 — Extract duplication
1. `packages/auth/next.ts`: `createBetterAuthRouteHandler(getAuth)`. Rewrite both auth catch-all routes to use it.
2. `packages/tenant/src/middleware.ts`: `createTenantMiddleware(options)`. Rewrite all 5 app middleware files.
3. `packages/shared/src/action-result.ts`: extract shared types + `validationError`/`invalidEntityError`/`actionError`. Update `apps/dashboard/src/lib/action-helpers.ts` and `apps/super-admin/src/lib/action-helpers.ts` to re-export from shared.
4. `packages/shared/src/cart-store.ts`: `createBaseCartStore(config)`. Rewrite the 3 app cart stores.
5. `packages/realtime/src/index.ts`: re-export `createAblyTokenRequest` + `publishRealtimeEvent` (remove need for `/server` subpath imports for these).
6. **Defer** email package, next-config factory, Ably token route factory.

### Phase 3 — Non-breaking normalization
1. Add root-level `error.tsx` + `global-error.tsx` + `not-found.tsx` to each of the 5 Next.js apps.
2. Retrofit dashboard action files to use `withRestaurantAction` / `withRestaurantAnyFlagAction` where they currently inline `requireFlags` + try/catch.
3. Split inline email JSX out of `session-payments.tsx` + `session.tsx` into `emails/` files; rename the action files back to `.ts`.
4. Spot-add Zod input validation where an action accepts raw input without `.safeParse`.
5. **Skip** API response envelope rewrite (bare JSON is the current contract).

### Phase 4 — Production packages
1. Install `@t3-oss/env-nextjs` at each app; create `src/env.ts` per app; replace `process.env['X']` at app boundaries.
2. Install `@t3-oss/env-core` at `packages/db` + `apps/worker`; repeat.
3. Add `packages/monitoring` with `captureException` / `captureMessage`. Replace `console.error` in catch blocks across server actions.
4. **Skip** react-hook-form (no forms currently using raw useState that'd benefit), **skip** date-fns.

### Phase 5 — Export hygiene
1. Replace wildcard `export * from './xxx'` in `packages/shared/src/index.ts` with named exports.
2. Add `exports` field to `packages/*/package.json` where missing.
3. Verify no circular deps with `madge` (one-off).

### Phase 6 — Docs
1. Update `CLAUDE.md` sections affected by the refactor (middleware/auth-handler/cart-store/action-helpers relocations).
2. Root `README.md` — add getting-started section if missing.
3. Add per-app `.env.example` derived from the root `.env.example`.
4. `.vscode/settings.json` + `extensions.json` already added in Phase 1.

### Phase 7 — Verification
1. `pnpm install --frozen-lockfile`.
2. `pnpm verify` (format:check + typecheck + test + build + lint).
3. Grep: `: any`, `as any`, `@ts-ignore`, `@ts-expect-error`, `console.log`. Move anything left to TODO.md.
4. Finalize `TODO.md` with bugs found during audit.
