# Menukaze Build Progress

## Phase 0 — Accounts & Local Toolchain
- [x] Accounts set up (MongoDB Atlas, Upstash, Ably, Resend, Razorpay, UploadThing, Sentry, Vercel, Fly.io)
- [x] Local toolchain (Node 22, pnpm 10, Docker)

## Phase 1 — Repo Initialisation
- [x] Turborepo monorepo scaffolded
- [x] All packages and apps created
- [x] Shared tooling (ESLint, Prettier, TypeScript, Vitest, Playwright configs)
- [x] Docker Compose for local MongoDB + Redis

## Phase 2 — Foundation Packages
- [x] `packages/db` — Mongoose models, tenant plugin, crypto
- [x] `packages/auth` — BetterAuth config
- [x] `packages/tenant` — host parser, tenant context
- [x] `packages/shared` — currency, errors, modifiers, payments, schemas, tax
- [x] `packages/rbac` — roles, flags, permission matrix
- [x] `packages/realtime` — Ably channels, event types, server publisher
- [x] `packages/ui` — shadcn/ui components

## Phase 3 — Scaffold Apps
- [x] `apps/dashboard` — Next.js App Router
- [x] `apps/storefront` — Next.js App Router
- [x] `apps/qr-dinein` — Next.js App Router
- [x] `apps/kiosk` — Next.js App Router (placeholder)
- [x] `apps/super-admin` — Next.js App Router (placeholder)
- [x] `apps/worker` — BullMQ worker (session sweeper, outbox drainer)

## Phase 4 — MVP Build (Steps 1–23)

### Track 1 — Foundation
- [x] **Step 1** — Bootstrap: auth, signup, login, email verification
- [x] **Step 2** — Multi-tenant scaffolding: restaurant_id scoping, subdomain routing

### Track 2 — Onboarding
- [x] **Step 3** — Onboarding Step 1: Restaurant Profile
- [x] **Step 4** — Onboarding Step 2: Menu Setup (manual + CSV import)
- [x] **Step 5** — Onboarding Step 3: Tables & QR Codes
- [x] **Step 6** — Onboarding Step 4: Razorpay Connection
- [ ] **Step 7** — Onboarding Step 5: Staff Invites *(DEFERRED from MVP scope)*
- [x] **Step 8** — Onboarding Step 6: Go Live + post-onboarding checklist

### Track 3 — Customer-Facing Storefront
- [x] **Step 9** — Default Storefront (SSR, branding, menu, schema.org SEO)
- [x] **Step 10** — Cart and Guest Checkout (Razorpay test mode)
- [x] **Step 11** — Order Confirmation + Tracking Page (Ably realtime)
- [x] **Step 12** — Email Confirmations and Receipts (React Email + Resend)

### Track 4 — Dashboard Operations
- [x] **Step 13** — Order Management Dashboard (live feed, status control)
- [x] **Step 14** — Single-Station KDS (realtime, tap-to-update, sound alerts)
- [x] **Step 15** — Menu Management Dashboard (CRUD, sold-out toggle, scheduled menus)
- [x] **Step 16** — Table Management Dashboard (CRUD, QR regeneration)
- [x] **Step 17** — Settings (profile, hours, holiday mode, delivery, throttling, receipt branding)
- [x] **Step 18** — Staff Management and RBAC (roles, invite/remove, permission matrix)
- [ ] **Step 19** — Walk-In / POS Order Entry *(DEFERRED from MVP scope)*

### Track 5 — QR Dine-In
- [x] **Step 20** — QR Dine-In Session Start (scan handler, session creation)
- [x] **Step 21** — QR Dine-In Multi-Round Ordering (multiple rounds, Call Waiter)
- [x] **Step 22** — QR Dine-In Bill and Payment (request bill, payment, table release)
- [x] **Step 23** — QR Dine-In Edge Cases (concurrent scans, payment failure, session timeout)

### Milestone Checkpoints
- [x] **C1** — First end-to-end order (Steps 10 + 13)
- [x] **C2** — Live KDS flow (Steps 11 + 14)
- [x] **C3** — Complete QR dine-in session (Steps 22 + 14)

### Phase 4 Gap Fixes (post-audit)
- [x] Tax calculation: `computeTax()` in `packages/shared`, applied in storefront checkout and QR session
- [x] Tax rules settings UI: configurable in dashboard Settings page
- [x] Auth collection name fix: `users` → `user` (BetterAuth default)
- [x] Realtime: session channel fan-out on order status change
- [x] KDS + orders-live: RSC hydration sync on `initialCards`/`initialRows` prop change
- [x] Staff page: current-user fallback when membership user lookup misses

## Phase 5 — Pre-Launch Review

- [x] **Security**: CSP headers (nonce-based, strict-dynamic) on dashboard, storefront, qr-dinein
- [x] **Security**: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [x] **Security**: `pnpm audit` — 0 high-severity vulnerabilities (playwright upgraded to 1.55.1)
- [x] **Compliance**: pre-launch checklist created (`docs/pre-launch-checklist.md`)
- [x] **Load smoke**: k6 script created (`scripts/smoke.js`, 50 VUs × 60 s)
- [ ] **Security**: Run `gitleaks` on full history (`brew install gitleaks && gitleaks detect --source .`)
- [ ] **Security**: Test Razorpay webhook with bad signature → must reject with 400
- [ ] **Compliance**: Cookie consent banner verification (manual)
- [ ] **Compliance**: Privacy policy page live at `/privacy`
- [ ] **Compliance**: Terms of service page live at `/terms`
- [ ] **Compliance**: DSAR export returns valid JSON bundle
- [ ] **Compliance**: Receipt PDF tax check (manual with configured tax rule)
- [ ] **Performance**: Storefront Lighthouse mobile — LCP ≤ 2.5 s, TBT ≤ 200 ms
- [ ] **Performance**: Dashboard tRPC P95 ≤ 300 ms
- [ ] **Performance**: KDS realtime P95 ≤ 2 s
- [ ] **Backup**: Atlas snapshot → restore to scratch cluster → verify one tenant
- [ ] **Observability**: Force Sentry error on staging, confirm alert
- [ ] **Observability**: Axiom logs + traces dry-run
- [ ] **Load smoke**: `k6 run scripts/smoke.js` — 0 errors, P95 < 1 s
- [ ] **End-to-end gate**: Full Phase 4 verification on staging

## Phase 6 — Production Deployment
*(Not started)*

## Phase 7 — Post-MVP Build (Steps 24–54)
*(Not started)*
