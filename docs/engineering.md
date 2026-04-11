# Menukaze — Engineering & System Design Document

> Companion to the product spec at `/home/shahwik/Desktop/menukaze/menukaze-product.md`.
> This is the architecture, services, schema, rules, and practices reference.

---

## Context

Menukaze is a multi-tenant "Shopify for restaurants" SaaS — a complete digital operating system (storefront, QR dine-in, kiosk, reservations, KDS, staff management, public API) delivered from a single signup, served at `{slug}.menukaze.com`. It is **web-only** — no native mobile apps. Every restaurant gets a branded subdomain or a custom domain; every order is tagged with exactly one channel; every tenant is isolated at the data layer.

This document is the single source of truth for:
- **Architecture** — how the 5 web apps + 1 worker + shared packages fit together.
- **External services** — which third-party services we use and what each is for.
- **Tech stack** — every framework, library, runtime choice with one-line rationale.
- **Database schema** — every MongoDB collection, its shape, its indexes, and the tenant-isolation rules.
- **Rules, regulations, and compliance** — which laws, standards, and certifications we satisfy and how.
- **Engineering practices** — the conventions to follow so the codebase stays consistent and reviewable.

Read this doc end-to-end before scaffolding.

---

## 1. Architecture Overview

Menukaze is a modular monorepo of **five Next.js apps + one Node worker** sharing a library of typed packages. All apps talk to one MongoDB cluster (Atlas in production) and one Redis instance (Upstash). Real-time fan-out runs through Ably. Long-running work (webhooks, emails, cron) runs on a dedicated Fly.io worker draining BullMQ queues.

```
                                 ┌──────────────────────────┐
                                 │      MongoDB Atlas       │
                                 │  (replica set, 2 dbs:    │
                                 │   live + sandbox)        │
                                 └────────────┬─────────────┘
                                              │
   ┌──────────────┐   ┌──────────────┐   ┌────▼───────┐   ┌──────────────┐
   │  storefront  │   │  qr-dinein   │   │ dashboard  │   │ super-admin  │
   │   Next.js    │   │   Next.js    │   │  Next.js   │   │   Next.js    │
   │    (A)       │   │    (A)       │   │    (B)     │   │    (B)       │
   └──────┬───────┘   └──────┬───────┘   └─────┬──────┘   └──────┬───────┘
          │                  │                  │                  │
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
       ┌────────── packages/* (shared, typed) ──────────┐
       │ db · shared · tenant · realtime · auth · rbac  │
       │ api (tRPC) · storefront-api (Hono) · payments  │
       │ uploads · email · jobs · webhooks · geofence   │
       │ rate-limit · idempotency · compliance · …      │
       └────────────────────────┬───────────────────────┘
                                │
       ┌────────────────────────┼───────────────────────┐
       ▼                        ▼                       ▼
┌────────────┐          ┌────────────┐           ┌────────────┐
│   Ably     │          │  Upstash   │           │  Fly.io    │
│ (realtime) │          │   Redis    │           │   worker   │
└────────────┘          │(cache+que) │           │(BullMQ)    │
                        └────────────┘           └─────┬──────┘
                                                       │
                        ┌──────────────┬──────────────┴──────────────┐
                        ▼              ▼                             ▼
                   ┌────────┐    ┌──────────┐                  ┌──────────┐
                   │ Resend │    │UploadThng│                  │ Razorpay │
                   │ email  │    │  files   │                  │ payments │
                   └────────┘    └──────────┘                  └──────────┘
```

### Apps

| App | URL | Role |
|---|---|---|
| `apps/storefront` | `{slug}.menukaze.com` | Public restaurant website + cart + checkout + order tracking |
| `apps/qr-dinein` | `{slug}.menukaze.com/t/{qrToken}` | Scan-to-order web app with multi-round sessions |
| `apps/kiosk` | `{slug}.menukaze.com/kiosk` | Full-screen self-serve tablet UI |
| `apps/dashboard` | `{slug}.menukaze.com/admin` | Operator dashboard: menu, orders, tables, staff, settings, KDS, analytics |
| `apps/super-admin` | `admin.menukaze.com` | Platform-owner console: merchants, plans, billing, platform health |
| `apps/worker` | Fly.io VM | Long-running BullMQ consumer for webhooks, email, receipts, cron |

### Public API

One shared **Hono** app mounted inside `apps/storefront` at `/api/v1/[[...path]]/route.ts`. It runs on Node runtime (Mongoose needs TCP). Served as `api.menukaze.com` via a Vercel rewrite. This is the public Storefront API that also powers storefront, QR dine-in, and kiosk clients. Sandbox lives at `sandbox-api.menukaze.com` with the same code against the `menukaze_sandbox` database.

### Internal API

**tRPC v11** router in `packages/api`, mounted on dashboard + super-admin at `/api/trpc/[trpc]`. Used for everything operator-side.

### Data layer

MongoDB Atlas (replica set, prod M10+). Two databases inside one cluster: `menukaze_live` and `menukaze_sandbox` — selected at runtime from the API-key prefix. Redis (Upstash) holds cache, rate-limit counters, idempotency records, webhook dedup, and session presence.

### Real-time

Ably. Publish only from the server after a mutation commits (via the outbox drainer). Subscribe from the browser via token-request with capabilities restricted to allowed channels.

### Background work

**Fly.io always-on Node VM** running BullMQ workers. Queues: `outbox-drain`, `webhooks`, `emails`, `receipts`, `billing-month-end`, `dunning`, `analytics-rollup`, `retention-purge`, `reservation-reminders`, `custom-domain-verify`.

---

## 2. Tech Stack

| Area | Choice | How we use it |
|---|---|---|
| Runtime | **Node.js 22 LTS** (Jod) | Target for every app and the worker. No Edge runtime (Mongoose needs TCP). |
| Language | **TypeScript 5.5** strict | Shared contract across tRPC, Hono, Mongoose, and zod. `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`. |
| Framework | **Next.js 16 App Router** (with React 19) | Every web app. RSC for storefront SEO. Middleware for subdomain routing. Route handlers for API mounts. Pinned in §3.4. |
| Monorepo | **Turborepo + pnpm 10 workspaces** | Incremental builds, remote cache in CI, workspace protocol `workspace:*` for internal deps. |
| Database | **MongoDB 7** (Atlas prod, Docker replset local) | Single cluster, two DBs. All tenant-scoped models go through Mongoose plugins. |
| ODM | **Mongoose 9** | Typed models, async pre-hooks for tenant middleware, transaction sessions. Pinned in §3.4. |
| Validation | **zod 3** | One schema per entity in `packages/shared`, reused by tRPC, Hono, Mongoose pre-validate hooks, and React Hook Form on the client. |
| Auth | **BetterAuth 1.x** with MongoDB adapter | Identity + sessions only. Multi-tenant role resolution lives in `packages/rbac`, not BetterAuth. Session cookies (HttpOnly, Secure, SameSite=Lax). |
| Internal API | **tRPC v11** | Dashboard ↔ server. Zero-cost type-safe contract for operator surfaces. |
| Public API | **Hono 4** (Node runtime) | Mounted as a Next.js catch-all route handler. zod-openapi plugin auto-generates Swagger for `/v1`. |
| Realtime | **Ably** JS client (WS with SSE fallback) | Server publishes after commit; browser subscribes via token requests. |
| Queue | **BullMQ 5** on Upstash Redis | Worker runs on Fly.io, not Vercel. |
| Cache / KV / rate-limit | **Upstash Redis** (REST) | Serverless-safe; `@upstash/ratelimit` for sliding windows. |
| Email | **Resend** + **React Email** | Templates in `packages/email`, queued via BullMQ, rendered server-side. |
| File storage | **UploadThing** | Tenant-scoped file router; signed uploads from browser for staff; server-generated signed URLs for private assets. |
| Payments | **Razorpay** at launch; **Cash** always; adapter interface for future gateways | Per-tenant credentials stored AES-256-GCM envelope-encrypted. |
| Geo / IP | **MaxMind GeoLite2** | IP geolocation fallback for Step 24 (QR misuse prevention). Refreshed monthly by cron. |
| PDF | **@react-pdf/renderer** | Receipt generation in the `receipts` queue. |
| Forms (dashboard) | **React Hook Form** + zod resolver | One resolver per shared zod schema. |
| Styling | **Tailwind CSS** | Utility-first CSS for every app; single `tailwind.config.ts` shared from `tooling/` |
| UI components | **shadcn/ui** (copy-pasted into `packages/ui`) on top of **Radix UI Primitives** | Not an npm package — components are generated into the repo with `pnpm dlx shadcn@latest add <name>` and owned in source. Zero lock-in, free, fully customisable. All 5 apps import from `@menukaze/ui`. |
| i18n | **next-intl** | Multi-language menu + UI (Step 49). RTL-aware. |
| Errors | **Sentry** | One project per app and the worker. PII stripped in `beforeSend`. |
| Logs | **Axiom** via **pino** JSON transport | Structured logs with `requestId`, `restaurantId`, `userId`, `apiKeyId`. |
| Tracing | **OpenTelemetry** → Axiom | Auto-instrumented for HTTP, Mongoose, Redis, BullMQ. |
| Uptime | **Better Uptime** | Pings every 1 min, public status page. |
| Hosting (web) | **Vercel** | One project per app; previews per PR; custom domains via Let's Encrypt. |
| Hosting (worker) | **Fly.io** | One always-on 256 MB Node VM. |
| CI | **GitHub Actions** + Turborepo remote cache | Lint → typecheck → test → build → preview per PR. |
| Secrets | **Vercel env vars** (prod/staging) + **`.env.local`** (dev, gitignored) | Zero-cost. No Doppler, no 1Password. Rotation documented. |
| Testing — unit | **Vitest** + `mongodb-memory-server` (replset) + `redis-memory-server` | Every package. |
| Testing — E2E | **Playwright** | One project per app with shared fixtures. |
| Linting | **ESLint** + **eslint-plugin-boundaries** | Enforces monorepo import rules. |
| Formatting | **Prettier** | Single config in `tooling/`. |

---

## 3. External Services

| Service | Purpose | Critical env vars | Notes |
|---|---|---|---|
| **MongoDB Atlas** | Primary database, replica set, two DBs (`menukaze_live`, `menukaze_sandbox`) | `MONGODB_URI`, `MONGODB_DB_LIVE`, `MONGODB_DB_SANDBOX` | Enabled encryption at rest. PITR backups. |
| **Upstash Redis** | Cache, rate-limit counters, idempotency records, webhook dedup, BullMQ backend | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | HTTPS transport — serverless-safe. |
| **Ably** | Real-time pub/sub for KDS, tracking, waiter alerts | `ABLY_API_KEY`, `NEXT_PUBLIC_ABLY_CLIENT_ID_SALT` | Publish server-only; subscribe via token endpoint. |
| **Resend** | Transactional email delivery | `RESEND_API_KEY`, `RESEND_FROM_DOMAIN` | Per-restaurant `From` name; Enterprise unlocks custom domain via Resend Domains API. |
| **UploadThing** | File storage (menu images, logos, receipts, DSAR exports) | `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID` | Tenant-scoped router; public CDN URLs for menu/logo, signed URLs for private assets. |
| **Razorpay** | Payment gateway (launch) — cards, UPI, wallets, netbanking, EMI | `RAZORPAY_WEBHOOK_SECRET` (platform wrapper); per-tenant keys encrypted in DB | Each restaurant uses its own account; webhook path is `/api/webhooks/razorpay/{restaurantId}`. |
| **MaxMind GeoLite2** | IP geolocation for QR misuse prevention fallback | `MAXMIND_LICENSE_KEY` | Bundled in `packages/geofence`, refreshed monthly by cron. |
| **Sentry** | Error tracking, perf monitoring, session replay | `SENTRY_DSN` (per project) | Session replay only on dashboard + super-admin, masked. |
| **Axiom** | Structured log + OTEL trace ingestion | `AXIOM_DATASET`, `AXIOM_TOKEN` | Saved dashboards for API health, latency, and webhook delivery. |
| **Better Uptime** | Uptime monitoring, status page | n/a | Public status page at `status.menukaze.com`. |
| **Vercel** | Web hosting, preview deploys, custom-domain TLS | `VERCEL_TOKEN` | One project per app. |
| **Fly.io** | Worker VM hosting (BullMQ consumer) | `FLY_API_TOKEN` | Single always-on 256 MB instance. |
| **GitHub Actions** | CI/CD | `GITHUB_TOKEN` | Turborepo remote cache backed by Vercel. |

---

## 3.1 Cost Strategy & Free Tiers

**Philosophy**: free tiers first; cheap paid services second; self-host only when it saves meaningful money without hurting reliability. The stack is designed so every paid service has a free tier sufficient for MVP + early paying customers. Swap to a self-hosted or cheaper alternative only when an actual usage threshold is crossed — never preemptively.

**Expected total monthly cost at launch: ~$5–15**. The only guaranteed spend is Fly.io's $5/mo worker VM; everything else runs on a free tier until usage grows.

| Service | Free-tier limit | Upgrade trigger | Cheap fallback if outgrown |
|---|---|---|---|
| **MongoDB Atlas** | M0 shared cluster: 512 MB storage, shared CPU | ~100 MB of real data, or when backups/PITR become mandatory | Self-host MongoDB on a $5/mo Hetzner VM; or upgrade to Atlas M10 (~$57/mo) |
| **Upstash Redis** | 10k commands/day, 256 MB, single region | > 10k commands/day sustained | Pay-as-you-go ($0.20 / 100k commands) or self-host Redis on the worker VM |
| **Ably** | 6M messages/month, 200 concurrent connections | > 200 concurrent browsers on KDS/tracking across all tenants | Self-host **Centrifugo** on the worker VM (open source, WS + SSE); or migrate to **PartyKit** on Cloudflare |
| **Resend** | 3k emails/month, 100/day, 1 domain | > 100/day average | **Amazon SES** ($0.10 per 1k emails = ~10× cheaper at scale) — BetterAuth, React Email, and our template registry all work unchanged |
| **UploadThing** | 2 GB total storage, unlimited transfers | > 2 GB | **Cloudflare R2** — 10 GB free, no egress fees, $0.015/GB after. Swap the upload router and replace CDN URLs with R2 signed URLs |
| **Razorpay** | Pay-per-transaction (no base fee) | n/a | n/a — gateway fees are unavoidable |
| **Sentry** | 5k errors/month, 50 replays/month | > 5k errors/month sustained | Self-host **GlitchTip** on the worker VM (Sentry-SDK compatible, open source) |
| **Axiom** | 500 GB ingest/month | Unlikely — hobbyists never cross this | Self-host **Grafana Loki** (more work, only if pushed) |
| **Better Uptime** | 10 monitors, 3-min interval | > 10 public endpoints | Self-host **Uptime Kuma** on the worker VM (free, open source) |
| **Vercel** | Hobby: 100 GB bandwidth/mo, unlimited requests | > 100 GB bandwidth | Pro ($20/mo) — defer until real customers push usage |
| **Fly.io** | — | — | **~$5/mo always-on** 256 MB `shared-cpu-1x` VM is the cheapest persistent worker option. Scale vertically before horizontally. |
| **MaxMind GeoLite2** | Free with license key | n/a | n/a |
| **GitHub Actions** | 2k Actions minutes/month (private repos); unlimited for public | > 2k minutes | Public the repo, or add a Hetzner runner |

**Rules the build follows to stay cheap:**

1. **Do not bring in any service that charges before usage exceeds a reasonable early-stage threshold.** If a library costs money to even install, look harder.
2. **Prefer writing small, well-scoped code over pulling in a SaaS for one feature.** Rate limiting, idempotency, webhook signing, audit hash chain, and the outbox pattern are all built in-house for exactly this reason — they would otherwise cost ~$30/mo each from a vendor.
3. **Use open-source npm packages over paid SDKs wherever the DX is comparable.** Every package listed in §3.2 and §3.3 is free and permissively licensed (MIT / Apache-2.0 / BSD).
4. **Never self-host just to save $5.** Running another server to save less than its own Fly.io cost is a lose.
5. **Batch and cache ruthlessly.** Every external API call has a cost; the outbox drainer batches events, Redis caches menus/settings/channels, and rate-limiters short-circuit expensive work.
6. **One worker VM does everything.** BullMQ workers, cron jobs, outbox drain, and (if we ever self-host) Centrifugo/GlitchTip/Uptime Kuma all coexist on one 256 MB VM until load demands otherwise.

---

## 3.2 Frontend Package Catalogue

Every npm dependency used inside `apps/storefront`, `apps/qr-dinein`, `apps/kiosk`, `apps/dashboard`, and `apps/super-admin`. Version numbers are minimum-supported; upgrade freely within the same major. Every package is free and open source.

### Core framework
| Package | Purpose |
|---|---|
| `next@16.1.0` | App Router, RSC, middleware, route handlers, `next/image`, `next/font` |
| `react@19.1.0` · `react-dom@19.1.0` | — |
| `typescript@^5.5` | Strict mode on every app |

### Data fetching, forms, validation
| Package | Purpose |
|---|---|
| `@tanstack/react-query@^5` | Query cache backing the tRPC client |
| `@trpc/client` · `@trpc/react-query` · `@trpc/next` | Dashboard + super-admin tRPC clients |
| `zod@4.2.0` | Schemas imported from `packages/shared` |
| `react-hook-form@^7` · `@hookform/resolvers` | Dashboard forms; one `zodResolver` per shared schema |
| `usehooks-ts` | Small hooks (`useLocalStorage`, `useMediaQuery`, `useDebounce`) |

### Styling & UI components — shadcn/ui

The entire UI layer is built on **shadcn/ui**, which is not an npm package — it is a CLI that copies component source files into your repo. You own every component, can edit freely, and there is nothing to update. Every shadcn component is a thin styled wrapper around a **Radix UI Primitive** (or, for a few, a vanilla React build).

**Where the components live**: a single shared package `packages/ui` with this structure:

```
packages/ui/
├── src/
│   ├── components/          # shadcn components (copy-pasted)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── select.tsx
│   │   ├── input.tsx
│   │   ├── form.tsx
│   │   ├── table.tsx
│   │   ├── toast.tsx
│   │   ├── tabs.tsx
│   │   ├── sheet.tsx
│   │   ├── command.tsx
│   │   ├── popover.tsx
│   │   ├── tooltip.tsx
│   │   ├── calendar.tsx
│   │   └── …
│   ├── lib/
│   │   └── cn.ts            # tailwind-merge + clsx helper
│   ├── hooks/
│   │   └── use-toast.ts
│   └── styles/
│       ├── globals.css      # tailwind base + shadcn CSS variables
│       └── themes.css       # light/dark theme tokens
├── tailwind.preset.ts       # shared Tailwind preset (colours, fonts, radii)
├── components.json          # shadcn CLI config (path aliases, style, colour)
└── package.json
```

**Adding a new component** (every app):
```
pnpm dlx shadcn@latest add <name> --cwd packages/ui
```
Edit, commit, done. No version bump, no dependency update.

**Every Next.js app** extends the shared Tailwind preset:
```ts
// apps/*/tailwind.config.ts
import preset from '@menukaze/ui/tailwind.preset';
export default { presets: [preset], content: [...] };
```

and imports components from `@menukaze/ui`:
```ts
import { Button, Dialog, Form } from '@menukaze/ui';
```

| Package | Purpose |
|---|---|
| `tailwindcss@4.1.16` | CSS-first config (no `tailwind.config.ts`); see `packages/ui/src/styles/globals.css` |
| `tailwindcss-animate` | Animation utilities shadcn components rely on |
| `@radix-ui/react-accordion` · `react-alert-dialog` · `react-avatar` · `react-checkbox` · `react-dialog` · `react-dropdown-menu` · `react-label` · `react-popover` · `react-progress` · `react-radio-group` · `react-scroll-area` · `react-select` · `react-separator` · `react-slot` · `react-switch` · `react-tabs` · `react-toast` · `react-toggle` · `react-tooltip` | The unstyled Radix primitives shadcn components wrap. Installed individually, not as `@radix-ui/react-*` bulk |
| `class-variance-authority@^0.7` | Variant API used by every shadcn component |
| `clsx` · `tailwind-merge` | Combined into `cn()` helper |
| `lucide-react` | Icon set used by shadcn examples — free, tree-shakeable |
| `sonner` | Toast notifications — shadcn's recommended toast primitive |
| `vaul` | Drawer component shadcn uses for mobile order detail |
| `cmdk` | Command palette (super-admin + dashboard search), shadcn's `<Command />` wraps this |
| `next-themes` | Dark-mode toggle — shadcn integrates natively |
| `input-otp` | OTP input for BetterAuth email verification, shadcn-compatible |
| `embla-carousel-react` | Carousel primitive shadcn uses for menu image galleries |

### Domain-specific UI
| Package | Purpose |
|---|---|
| `@uploadthing/react` · `uploadthing` | File upload widget (menu images, logos) |
| `ably@^2` | Realtime client for KDS, tracking, waiter alerts |
| `@fingerprintjs/fingerprintjs` | Device fingerprint for QR misuse prevention (Step 24) |
| `qrcode` · `qrcode.react` | QR code rendering for table QR printouts and preview |
| `html5-qrcode` | QR scanning in kiosk when camera attached (optional) |
| `recharts` | Analytics dashboard charts — zero config, great DX, MIT |
| `react-day-picker` | Reservation date/time pickers |
| `date-fns@^3` | Locale-aware date formatting (way cheaper than moment) |
| `@number-flow/react` | Animated currency/count transitions in dashboard KPIs |
| `react-aria-components` | Drop-in accessible table sorting and grid navigation |

### i18n + locale
| Package | Purpose |
|---|---|
| `next-intl@^4` | Multi-language menu + UI, RTL-aware |
| `@formatjs/intl-localematcher` | Negotiates preferred language from browser |

### PWA + offline (storefront, QR, kiosk, KDS)
| Package | Purpose |
|---|---|
| `@serwist/next` · `serwist` | Workbox successor — service worker generation for Next.js App Router |
| `idb` | Small IndexedDB wrapper for offline mutation queue |

### Observability (client)
| Package | Purpose |
|---|---|
| `@sentry/nextjs` | Error tracking + performance + session replay on dashboard/super-admin only |
| `@vercel/analytics` | Web vitals, free on Vercel |
| `@vercel/speed-insights` | Real user monitoring for storefront LCP budget |

### Testing + dev tooling
| Package | Purpose |
|---|---|
| `vitest` · `@vitest/coverage-v8` | Unit tests colocated with components |
| `@testing-library/react` · `@testing-library/jest-dom` · `@testing-library/user-event` | Component tests |
| `@playwright/test` · `@axe-core/playwright` | E2E + accessibility assertions |
| `msw@^2` | Mock service worker for integration tests |
| `storybook@^8` + `@storybook/nextjs` | Component catalogue for shadcn-derived components (optional, launch-day skip) |

---

## 3.3 Backend Package Catalogue

Every npm dependency used inside `packages/*` and `apps/worker`. All free and open source.

### Runtime & framework
| Package | Purpose |
|---|---|
| `node@22` (engines field) | LTS (Jod) |
| `typescript@^5.5` | — |
| `next@16.1.0` | Route handlers for Hono mount + dashboard SSR |
| `hono@^4` | Public `/v1` API router |
| `@hono/zod-validator` | Route-level zod validation middleware |
| `@hono/zod-openapi` | Auto-generate OpenAPI / Swagger spec for `/v1` |
| `@trpc/server@^11` | Internal dashboard API |
| `zod@4.2.0` | Schemas imported from `packages/shared` |

### Database & migrations
| Package | Purpose |
|---|---|
| `mongodb@^6` | Native driver (peer of Mongoose + used directly for sessions/transactions) |
| `mongoose@9.4.1` | ODM, tenant plugin, hooks, transactions |
| `migrate-mongo` | Versioned migration changelog |

### Auth & RBAC
| Package | Purpose |
|---|---|
| `better-auth@^1` | Identity + sessions |
| `better-auth/adapters/mongodb` | Bundled MongoDB adapter |
| `argon2` | Password hashing (BetterAuth default, faster than bcrypt on modern Node) |

### Queue, cache, rate-limit
| Package | Purpose |
|---|---|
| `bullmq@^5` | Queues for webhooks, emails, receipts, cron |
| `ioredis@^5` | BullMQ's TCP Redis client (Upstash exposes a TCP endpoint for this) |
| `@upstash/redis` | REST client for cache + idempotency (serverless-safe) |
| `@upstash/ratelimit` | Sliding-window rate limiting |
| `node-cron` | In-worker cron scheduler for recurring BullMQ job enqueue |

### Realtime
| Package | Purpose |
|---|---|
| `ably@^2` | Server SDK — publish from the outbox drainer; issue token requests |

### Email
| Package | Purpose |
|---|---|
| `resend` | API client |
| `react-email@^5` · `@react-email/components@^1` · `@react-email/render@^2` | Template components + HTML/text render |

### File uploads
| Package | Purpose |
|---|---|
| `uploadthing` · `@uploadthing/shared` | Server router, signed upload URLs, per-category config |

### Payments
| Package | Purpose |
|---|---|
| `razorpay` | Official Razorpay Node SDK |
| `crypto` (built-in) | HMAC-SHA256 verification of Razorpay webhook signatures |

### PDF + i18n
| Package | Purpose |
|---|---|
| `@react-pdf/renderer` | Receipt PDF generation in the `receipts` queue |
| `next-intl` | Server-side locale negotiation for emails + receipts |

### Security & encryption
| Package | Purpose |
|---|---|
| `crypto` (built-in) | AES-256-GCM envelope encryption for per-tenant Razorpay secrets, HMAC webhook signing, audit hash chain |
| `isomorphic-dompurify` | Sanitises HTML previews server-side (receipt preview) |
| `helmet` (via Hono middleware equivalents) | CSP / HSTS / X-Frame-Options on public API routes |

### Geo
| Package | Purpose |
|---|---|
| `@maxmind/geoip2-node` | MaxMind GeoLite2 reader for IP geolocation fallback |

### Observability (server)
| Package | Purpose |
|---|---|
| `@sentry/node` · `@sentry/nextjs` | Error tracking |
| `pino@^9` · `pino-pretty` (dev) | Structured JSON logs |
| `@axiomhq/pino` | Pino transport that ships directly to Axiom |
| `@opentelemetry/sdk-node` · `@opentelemetry/auto-instrumentations-node` | Auto-instrument HTTP, Mongoose, Redis, BullMQ |
| `@opentelemetry/exporter-trace-otlp-http` | Export traces to Axiom OTEL endpoint |

### Dev & build tooling
| Package | Purpose |
|---|---|
| `turbo@^2` | Monorepo build orchestration + remote cache |
| `tsx` | TypeScript script runner for `scripts/seed.ts`, `scripts/migrate.ts`, local dev |
| `tsup` | Bundles internal packages to CJS+ESM with sourcemaps |
| `dotenv` | Loads `.env.local` in dev |
| `eslint@^9` · `@typescript-eslint/*` · `eslint-config-next` · `eslint-plugin-boundaries` · `eslint-plugin-unicorn` | Linting and monorepo import-boundary enforcement |
| `prettier@^3` · `prettier-plugin-tailwindcss` | Formatting |
| `husky@^9` · `lint-staged@^15` | Pre-commit hooks |
| `gitleaks` (binary via Homebrew / GH Action) | Secret scanning on every commit + CI |

### Testing
| Package | Purpose |
|---|---|
| `vitest` · `@vitest/coverage-v8` | Unit + integration tests |
| `mongodb-memory-server` | Ephemeral Mongo replset for tests that need real transactions |
| `ioredis-mock` | In-memory Redis for BullMQ tests (lighter than `redis-memory-server`) |
| `msw@^2` | Mocks Resend, Razorpay, UploadThing HTTP calls |
| `@playwright/test` | E2E harness |
| `supertest` | HTTP assertions on the Hono `/v1` app without spinning Next |

---

## 3.4 Verified Compatible Version Matrix (locked 2026-04-11)

The package versions in §3.2 / §3.3 above are *family-level* guidance ("which library, what major"). The exact pins below are the **verified compatible matrix** as of the lock date — every peer dependency was checked against the npm registry, and every chosen version is at least 2–4 weeks old (avoids "released yesterday" patches that haven't shaken out bugs). All future installs are reproducible from `pnpm-lock.yaml`; new packages are added with `save-exact=true` (`.npmrc`) so versions never drift implicitly.

**Anchor versions** (everything else flows from these):

| Package | Pin | Released | Why |
|---|---|---|---|
| `node` | `22.x` (engines) | LTS Jod, supported until Apr 2027 | Production runtime |
| `pnpm` | `10.33.0` | active | packageManager + workspaces |
| `typescript` | `5.9.3` | stable | tRPC v11 needs ≥ 5.7.2 |
| `next` | `16.1.0` | 2025-12-18 | 4 mo old; skip 16.2.x (3 days old) |
| `react` / `react-dom` | `19.1.0` | 2025-03-28 | 1 yr old, very stable; required by Next 16 |
| `tailwindcss` | `4.1.16` | Aug 2025 | Tailwind 4 LTS line; CSS-first config; skip 4.2.x (1 mo) |
| `mongoose` | `9.3.3` | Mar 2026 | Latest 9.3.x; skip 9.4.x (1 wk) |
| `mongodb` | `7.x` | matches mongoose 9 | native driver |
| `zod` | `4.2.0` | 2025-12-15 | 4 mo old; major has been stable for over a year |
| `vitest` | `3.2.x` | Jun 2025 | 10 mo old; skip Vitest 4 (still maturing) |
| `pino` | `9.x` | active | Skip pino 10 (very fresh) |

**Auth, API, real-time**:

| Package | Pin | Notes |
|---|---|---|
| `better-auth` | `1.5.6` | 2026-03-22, ~3 wks; supports Next 14/15/16, mongodb 6/7 |
| `argon2` | `0.43.x` | password hashing for BetterAuth |
| `@trpc/server` · `@trpc/client` · `@trpc/react-query` | `11.10.0` | 2026-02-09, 9 wks |
| `@tanstack/react-query` | `5.x` | tRPC peer |
| `hono` | `4.11.0` | 2025-12-13, 4 mo |
| `@hono/zod-validator` | `0.7.x` | accepts Zod 3.25+ AND Zod 4 |
| `@hono/zod-openapi` | `1.x` | matches Hono 4 |
| `ably` | `2.x` | server + client SDK |

**Queue, cache, storage, payments**:

| Package | Pin | Notes |
|---|---|---|
| `bullmq` | `5.x` | latest 5 line; needs `ioredis@5` |
| `ioredis` | `5.x` | BullMQ TCP client |
| `@upstash/redis` | `1.x` | REST client for cache + idempotency |
| `@upstash/ratelimit` | `2.x` | sliding window |
| `resend` | `6.x` | latest |
| `react-email` · `@react-email/components` · `@react-email/render` | `5.x` · `1.x` · `2.x` | server-rendered email |
| `uploadthing` · `@uploadthing/react` | `7.7.x` · `7.3.x` | per peer chain |
| `razorpay` | `2.x` | official Node SDK |
| `@react-pdf/renderer` | `4.x` | receipt PDFs |
| `migrate-mongo` | `14.x` | versioned migrations |
| `@maxmind/geoip2-node` | `6.x` | GeoLite2 reader |

**Observability**:

| Package | Pin | Notes |
|---|---|---|
| `@sentry/nextjs` · `@sentry/node` | `10.40.0` | 2026-02-24, 7 wks; supports Next 13/14/15/16 |
| `@axiomhq/pino` | `1.x` | pino transport |
| `@opentelemetry/sdk-node` | `0.214.x` | OTel slow track |
| `@opentelemetry/auto-instrumentations-node` | `0.72.x` | matches |

**Frontend (apps + packages/ui)**:

| Package | Pin | Notes |
|---|---|---|
| `next-intl` | `4.8.x` | i18n; supports Next 12–16, React 16–19 |
| `react-hook-form` | `7.55.x` | forms |
| `@hookform/resolvers` | `3.x` or `5.x` | Zod 4 resolver |
| `@radix-ui/react-*` | latest stable per primitive | shadcn pulls these |
| `class-variance-authority` | `0.7.x` | shadcn variants |
| `clsx` | `2.x` | combined into `cn()` |
| `tailwind-merge` | `3.x` | matches Tailwind 4 |
| `lucide-react` | latest | icon set |
| `sonner` | `2.x` | toasts |
| `vaul` | `1.x` | mobile drawer |
| `cmdk` | `1.x` | command palette |
| `next-themes` | `0.4.x` | dark mode |
| `input-otp` | `1.x` | OTP input |
| `embla-carousel-react` | `8.x` | carousel |
| `recharts` | `2.x` | analytics charts |
| `react-day-picker` | `9.x` | date picker |
| `date-fns` | `4.x` | locale-aware dates |
| `@uploadthing/react` | `7.3.x` | matches uploadthing 7.7 |
| `@fingerprintjs/fingerprintjs` | `4.x` | device fingerprint (Step 24) |
| `qrcode` · `qrcode.react` | `1.x` · `4.x` | QR rendering |
| `@serwist/next` · `serwist` · `idb` | `9.5.x` · `9.5.x` · `8.x` | PWA + offline |

**Testing**:

| Package | Pin | Notes |
|---|---|---|
| `vitest` · `@vitest/coverage-v8` | `3.2.x` | unit + integration |
| `mongodb-memory-server` | `10.x` | matches mongoose 9 |
| `ioredis-mock` | `8.x` | in-memory Redis |
| `msw` | `2.x` | HTTP mocking |
| `@playwright/test` | `1.5x` | E2E + Next 16 peer |
| `supertest` | `7.x` | Hono assertions |

**Build / dev tooling**:

| Package | Pin | Notes |
|---|---|---|
| `turbo` | `2.9.6` | monorepo orchestrator |
| `tsx` | `4.x` | TS script runner |
| `tsup` | `8.x` | bundle internal packages |
| `prettier` | `3.8.2` | + `prettier-plugin-tailwindcss@0.6.14` |
| `husky` · `lint-staged` | `9.x` · `15.x` | pre-commit |
| `eslint` | `9.15.x` (flat config) | + `typescript-eslint@8.15`, `eslint-plugin-unicorn@56`, `eslint-plugin-boundaries@5`, `eslint-config-next@16.1.0` |

**Compatibility verification done before this matrix was locked** (full peer-dep chain):

- ✓ Next 16 → React 18 OR 19
- ✓ React 19 → all UI deps (radix, shadcn, react-hook-form, react-day-picker, ably, uploadthing/react, react-email/components)
- ✓ @sentry/nextjs 10 → Next 13/14/15/16
- ✓ better-auth 1.5 → Next 14/15/16, React 18/19, mongodb 6/7
- ✓ @hono/zod-validator → zod 3.25+ AND zod 4
- ✓ tRPC 11 → TypeScript ≥ 5.7.2 (we have 5.9.3)
- ✓ Mongoose 9 → no React peer
- ✓ react-hook-form → React 16-19 + @hookform/resolvers compatible with Zod 4
- ✓ Vitest 3.2 → Vite 5/6/7
- ✓ Ably 2 → React ≥ 16.8

**Re-lock policy**: re-run the verification check (every package's `npm view <pkg> peerDependencies` against the matrix) before any major version bump in the matrix above.

---

## 4. Monorepo Layout

```
menukaze/
├── apps/
│   ├── dashboard/          # Next.js
│   ├── storefront/         # Next.js + Hono /v1 mount
│   ├── qr-dinein/          # Next.js
│   ├── kiosk/              # Next.js
│   ├── super-admin/        # Next.js
│   └── worker/             # Node service on Fly.io
├── packages/
│   ├── ui/                 # shadcn/ui components (copy-pasted), Tailwind preset, design tokens, shared layouts, icon set
│   ├── db/                 # Mongoose models, indexes, migrations, seed helper
│   ├── shared/             # zod schemas, TS types, currency/locale utils, error codes
│   ├── tenant/             # tenant context middleware (Next.js, tRPC, Hono)
│   ├── realtime/           # Ably channel-name builders, publish helpers, token endpoint
│   ├── uploads/            # UploadThing file router
│   ├── payments/           # PaymentGatewayInterface in shared; adapters here
│   ├── auth/               # BetterAuth config + session helpers
│   ├── rbac/               # permission-flag registry + checker
│   ├── api/                # tRPC routers
│   ├── email/              # React Email templates + Resend client
│   ├── jobs/               # BullMQ queues + processors + cron registry
│   ├── webhooks/           # dispatcher + signer + delivery log
│   ├── analytics/          # rollup queries + cached reports
│   ├── storefront-api/     # Hono routers + middleware chain
│   ├── rate-limit/         # Upstash ratelimit wrapper
│   ├── idempotency/        # Idempotency-Key middleware
│   ├── geofence/           # Haversine + IP lookup
│   ├── compliance/         # consent, DSAR, retention
│   ├── sdk-js/             # published JS SDK
│   └── sdk-py/             # published Python SDK
├── tooling/
│   ├── eslint-config/
│   ├── tsconfig/
│   ├── vitest-config/
│   └── playwright-config/
├── scripts/
│   ├── seed.ts
│   └── migrate.ts
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── docker-compose.yml      # mongo replset + redis + mailhog
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Import rules** (enforced by `eslint-plugin-boundaries`):
- `apps/*` may import any `packages/*`.
- `packages/db` and `packages/shared` are **leaves** — zero internal deps.
- `packages/payments` interface lives inside `shared`; adapters in `packages/payments` import it.
- A package may not import from another app.
- Cross-package dependencies flow through `shared` or the leaf foundational packages only.

---

## 5. Database Schema — MongoDB

### 5.1 Tenant isolation strategy

Every tenant-owned collection has `restaurantId: ObjectId` as the first field and as the **leading key of every compound index**.

A Mongoose plugin **`tenantScopedPlugin`** attaches pre-hooks to `find`, `findOne`, `findOneAndUpdate`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `aggregate`, `countDocuments`. Each hook asserts `this.getQuery().restaurantId` is present; otherwise it throws `TenantContextMissing`. Bypassing the plugin requires explicit `Model.withoutTenant(...)`, used only by super-admin and cron.

Handlers **never** touch raw models. The tenant middleware constructs a per-request `ctx.repos` object — each model is wrapped in `createTenantRepo(Model, tenantId)` that returns a narrowed, tenant-bound API. Super-admin uses a separate `SuperAdminRepo` that requires an audit reason on every write.

### 5.2 Transaction policy

Mongo 7 on Atlas supports multi-document ACID transactions on replica sets. Use transactions for:

- **Order placement** — insert order → insert outbox row → commit. Ably publish + email + webhook dispatch happen **after** commit via the outbox drainer. This gives us atomic "insert + side effects" with at-least-once delivery for side effects.
- **Subscription state transitions** (trial → active → past_due).
- **CDP customer merge** (Step 35).
- **Idempotency reservation** (reserve → run handler → store response, all in one txn so rollback clears the reservation).

**Outbox pattern**: a dedicated `event_outbox` collection is the source of truth for anything crossing the Mongo boundary. A BullMQ producer drains it every 2 s. Eventual consistency is explicitly accepted for analytics rollups, channel counters, and platform-health metrics.

### 5.3 Sandbox isolation

Two Mongo databases in one cluster: `menukaze_live` and `menukaze_sandbox`. A `DbContext` resolved from the API-key prefix (`mk_live_` vs `mk_test_`) selects the connection pool. Identical collection names → one code path. Sandbox data never reaches live analytics.

### 5.4 Collections

All collections get `createdAt` / `updatedAt` via Mongoose timestamps. All `_id` fields are `ObjectId` unless noted.

#### `users`
BetterAuth identity (one row per human).
```
{ email, emailLower, emailVerified, passwordHash, name, locale, createdAt }
```
Indexes: unique `emailLower`.

#### `sessions`
BetterAuth sessions.
```
{ userId, token, expiresAt, ip, userAgent }
```
Indexes: unique `token`, TTL on `expiresAt`.

#### `staff_memberships`
User × restaurant role pairing. A user can be Owner in one restaurant and Waiter in another.
```
{ restaurantId, userId, role: 'owner'|'manager'|'waiter'|'kitchen'|'cashier'|'custom',
  customPermissions?: string[], assignedTableIds?: ObjectId[],
  status: 'active'|'deactivated', invitedBy, lastLoginAt, lastLoginIp }
```
Indexes: unique `{restaurantId, userId}`, `{userId}`.

#### `super_admins`
Platform operators, separated from staff so a compromised staff cannot escalate.
```
{ userId, scopes: string[], createdAt }
```
Indexes: unique `userId`.

#### `restaurants`
The tenant root.
```
{ slug, name, customDomain?, sslStatus?,
  country, currency, locale, timezone,
  addressStructured, geo: { lat, lng }, wifiPublicIps: string[],
  logoUrl, phone, hours: [{ day, open, close, breaks }],
  planId, subscriptionStatus: 'trial'|'active'|'past_due'|'suspended'|'cancelled',
  razorpayKeyIdEnc, razorpayKeySecretEnc,
  geofenceRadiusM: 100,
  hardening: { strictMode, wifiGate, firstOrderDelayS, maxSessionsPerTable, geofenceRadiusM },
  taxRules: [{ name, percent, inclusive, scope, label }],
  featureFlags: { [key]: bool },
  receiptBranding: { headerColor, footerText, socials },
  notificationPrefs: { email, dashboard, sound } }
```
Indexes: unique `slug`, sparse unique `customDomain`, `{subscriptionStatus}`, `2dsphere` on `geo`.

#### `channels`
Built-in + API-based. Each API key is a channel.
```
{ restaurantId, type: 'storefront'|'qr_dinein'|'kiosk'|'walk_in'|'api',
  name, icon, color, kdsSound, kdsColor,
  prepTimeOverrideM?, taxOverrides?,
  enabled, apiKeyId?, createdAt }
```
Indexes: `{restaurantId, type}`, `{restaurantId, enabled}`.

#### `api_keys`
```
{ restaurantId, channelId, mode: 'live'|'test',
  keyPrefix: 'mk_live_'|'mk_test_', keyHash, last4,
  scope: 'read'|'read_write'|'admin', corsOrigins: string[],
  expiresAt?, revokedAt?, lastUsedAt,
  usage: { totalRequests, totalOrders, revenueMinor } }
```
Indexes: unique `keyHash`, `{restaurantId}`. Plaintext shown only once at creation.

#### `menus`
```
{ restaurantId, name, schedule?: { days, startTime, endTime }, order }
```
Indexes: `{restaurantId, order}`.

#### `categories`
```
{ restaurantId, menuId, name, order, stationIds?: ObjectId[] }
```
Indexes: `{restaurantId, menuId, order}`.

#### `items`
Modifiers are embedded (read-heavy, always fetched with the item).
```
{ restaurantId, categoryId,
  name: { [lang]: string }, description: { [lang]: string },
  priceMinor: number, currency,
  imageUrl, dietaryTags: string[],
  modifiers: [{ id, name, required, max,
                options: [{ id, name, priceMinor }] }],
  comboOf?: ObjectId[], soldOut: boolean,
  ageRestricted?: boolean, stationIds?: ObjectId[] }
```
Indexes: `{restaurantId, categoryId, soldOut}`, text index on `name`.

#### `tables`
```
{ restaurantId, number, name, capacity, zone,
  qrToken, status: 'available'|'occupied'|'bill_requested'|'paid'|'needs_review',
  lastReleasedAt }
```
Indexes: unique `qrToken`, `{restaurantId, status}`.

#### `table_sessions`
```
{ restaurantId, tableId, state: 'active'|'bill_requested'|'paid'|'closed'|'needs_review',
  participants: [{ customerId?, name, email, phone, deviceFingerprint }],
  roundIds: ObjectId[], startedAt, lastActivityAt, closedAt }
```
Indexes: `{restaurantId, tableId, state}`.

#### `orders`
Items are **embedded**. Orders are append-only after confirmation; modifier prices are snapshot at order time so menu edits never rewrite history.
```
{ restaurantId, channelId, tableSessionId?,
  type: 'dine_in'|'takeaway'|'delivery'|'kiosk'|'walkin',
  status: 'received'|'confirmed'|'preparing'|'ready'|'served'|
          'out_for_delivery'|'delivered'|'completed'|'cancelled'|'suspicious',
  items: [{ itemId, nameSnapshot, qty, priceMinor,
            modifiers: [{id, nameSnap, priceMinor}],
            instructions, stationId?, lineStatus }],
  customer: { id?, name, email, phone, address? },
  subtotalMinor, taxMinor, serviceChargeMinor, tipMinor, totalMinor, currency,
  paymentIntentId?, paymentStatus, tokenNumber?,
  channelColorSnap, prepTimeMinSnap,
  isTest: false, idempotencyKey? }
```
Indexes: `{restaurantId, createdAt: -1}`, `{restaurantId, channelId, createdAt: -1}`, `{restaurantId, status, createdAt: -1}`, `{restaurantId, tableSessionId}`, `{restaurantId, paymentIntentId}` sparse, sparse unique `idempotencyKey`.

#### `order_holds`
Step 24 suspicious orders pending manager review.
```
{ restaurantId, orderId,
  reason: 'geofence'|'velocity'|'fingerprint'|'anomaly',
  evidence: {...},
  reviewStatus: 'pending'|'approved'|'rejected',
  reviewedBy?, reviewedAt? }
```
Indexes: `{restaurantId, reviewStatus}`.

#### `customers`
CDP profile (Step 35). Deduped by email, then phone.
```
{ restaurantId, emailLower?, phoneE164?, name,
  firstChannelId, primaryChannelId, channelIds: ObjectId[],
  orderCount, lifetimeSpendMinor, lastOrderAt, tags,
  marketingConsent: { granted, timestamp, version },
  retentionAnonymiseAt, addresses: [...] }
```
Indexes: partial unique `{restaurantId, emailLower}`, partial `{restaurantId, phoneE164}`.

#### `reservations`
```
{ restaurantId, customerInfo, partySize, startAt, endAt,
  status: 'pending'|'confirmed'|'cancelled'|'seated'|'no_show'|'completed',
  tableId?, reminderSentAt }
```
Indexes: `{restaurantId, startAt}`, `{restaurantId, status}`.

#### `webhooks`
```
{ restaurantId, url, events: string[], secretHash,
  enabled, ipAllowlist: string[], createdAt }
```
Indexes: `{restaurantId, enabled}`.

#### `webhook_deliveries`
```
{ restaurantId, webhookId, eventId, eventType, payload, signature,
  attempts: [{ at, statusCode, latencyMs, error }],
  state: 'pending'|'delivered'|'failed', nextRetryAt, createdAt }
```
Indexes: `{state, nextRetryAt}`, TTL 90 d on `createdAt`.

#### `event_outbox`
Transactional outbox.
```
{ restaurantId, type, payload, drainedAt?, createdAt }
```
Indexes: `{drainedAt: 1, createdAt: 1}`.

#### `staff_invites`
```
{ restaurantId, email, role, tokenHash, invitedBy, expiresAt, acceptedAt? }
```
Indexes: unique `tokenHash`.

#### `audit_logs`
Tamper-evident hash chain.
```
{ restaurantId, actorUserId, actorRoleAtTime, action, resource, resourceId,
  diff, ip, userAgent, prevHash, hash, seq, createdAt }
```
`hash = sha256(prevHash + canonicalJSON(entry))`. A daily cron verifies the chain. Indexes: unique `{restaurantId, seq}`, `{restaurantId, createdAt: -1}`.

#### `platform_audit_logs`
Same shape as `audit_logs` but for super-admin actions; no `restaurantId`. Separate collection so a restaurant tenant cannot even theoretically read super-admin activity.

#### `plans`, `subscriptions`, `invoices`, `feature_flags`
```
plans: { name, monthlyMinor, commissionBps, flatFeeMinor, rateLimitPerMin,
         features: string[], active }
subscriptions: { restaurantId, planId, status, trialEndsAt,
                 currentPeriodStart, currentPeriodEnd, overrides?, paymentMethodRef }
invoices: { restaurantId, number, lineItems, totalMinor, currency,
            periodStart, periodEnd, status, dueAt, paidAt?, dunningAttempts }
feature_flags: { key, globallyEnabled, restaurantOverrides, planGates }
```

#### `idempotency_records`
```
{ keyScope: 'restaurantId:apiKeyId:key', requestHash, response, statusCode, createdAt }
```
Indexes: unique `keyScope`, TTL 24 h on `createdAt`.

#### `consent_records`, `dsar_requests`
GDPR/CCPA compliance records.

#### Redis (not Mongo)
Rate limit counters, session presence, cache entries, idempotency hot-path, webhook dedup.

---

## 6. Multi-Tenancy & Subdomain Routing

Next.js root `middleware.ts` in every app:

1. Read `host` header.
2. If `*.menukaze.com`, extract `slug`. Reserved: `www`, `admin`, `api`, `sandbox-api`.
3. Else lookup `restaurants.customDomain` (cached in Redis `tenant:domain:{host}`, 5-min TTL).
4. Inject `x-tenant-id` + `x-tenant-slug` headers; rewrite URL to internal app root.
5. Server Components, tRPC procedures, and Hono handlers read from `packages/tenant/context.ts` → `ctx.tenant = { id, slug, mongoDb, repos }`.

**Custom domains** (Step 50): dashboard → Vercel Domains API → Vercel auto-provisions TLS via Let's Encrypt → `custom-domain-verify` cron polls status → flip `sslStatus: 'active'`. We never manage certs ourselves.

---

## 7. Authentication & Authorization

- **BetterAuth** manages identity (email + password, email verification, password reset) and session cookies. MongoDB adapter.
- **Multi-tenant roles** are NOT handled by BetterAuth. A request carries a user session; the tenant middleware resolves `staff_memberships` for `(userId, tenantId)` and materialises an effective permission-flag set using:
  1. Base flag set from the role (`owner`, `manager`, `waiter`, `kitchen`, `cashier`).
  2. Override from `customPermissions` if `role === 'custom'`.
- **tRPC middleware** `withPermission(...flags)` wraps every mutation and most queries.
- **Hono middleware** `requireApiKeyScope('read' | 'read_write' | 'admin')` is the orthogonal axis for the public API.
- **Owner-only deny list** (`billing.manage`, `api_keys.manage`, `webhooks.manage`) cannot be assigned to Custom roles; enforced by the flag registry in `packages/rbac`.
- **Customers** (§15 of spec) log in separately with BetterAuth as `type: 'customer'` — enforced in middleware so a customer session can never reach a staff surface.
- **Super-admin** uses a second auth surface: `apps/super-admin` rejects any session whose `userId` is not in `super_admins`. Impersonation issues a time-limited side-session with `impersonatedBy` stamped on every audit log entry.

### Permission flag catalogue
The full flag set is defined in `packages/rbac/src/flags.ts` and mirrors spec §5. Every role has a canonical flag set; Custom roles are built by flipping flags.

---

## 8. API Architecture

### 8.1 tRPC (internal, dashboard + super-admin)

Routers per domain: `restaurant`, `menu`, `order`, `table`, `reservation`, `staff`, `settings`, `analytics`, `billing`, `platform`, `customer`, `feedback`. All input schemas imported from `packages/shared/src/schemas/`.

### 8.2 Hono (public `/v1`)

Mounted in `apps/storefront/app/api/v1/[[...path]]/route.ts`. Middleware chain (order matters):

1. `cors` — per-key origin allowlist, bypass when no `Origin`.
2. `requestId` — attach `req_*` to context + logs.
3. `resolveTenantFromKey` — hash `X-Menukaze-Key`, load `api_keys`, attach `tenant`, `channel`, `scope`, `mode`.
4. `rateLimit` — Upstash sliding window keyed by `apiKeyId`, limit per plan (spec §10).
5. `idempotency` — writes only; see §13.
6. `zValidator` — zod schema per route.
7. Handler.
8. Error envelope middleware — formats every error as `{ error: { code, message, status } }`.

**Domains** (match spec §10): Restaurant, Menu, Cart, Order, Table Session, Payment, Reservation, Customer, Channel.

**Sandbox**: `sandbox-api.menukaze.com` → same code, `menukaze_sandbox` database.

**Shared zod** lives in `packages/shared/src/schemas/` — consumed by both tRPC and Hono. This is the single contract boundary between internal and public APIs.

---

## 9. Channel System

- `channels` is seeded with 4 built-ins at restaurant creation (Storefront, QR Dine-In, Kiosk, Walk-In/POS). Each built-in gets a hidden system key (`mk_live_sys_*`).
- When a restaurant creates an API key from the dashboard, a transaction inserts a `channels` row first, then an `api_keys` row linking to it.
- Every order write stamps `channelId` from `ctx.channel` — set by `resolveTenantFromKey` for public API, set explicitly from `ctx.tenant.channels.walkIn` for internal walk-in creates.
- KDS queries pull orders joined with channel metadata (color, sound, prep-time override, tax override). Cached per restaurant in Redis (`channels:{restaurantId}`, 60 s).

---

## 10. Real-Time Architecture

**Channel naming** (locked in `packages/realtime/src/channels.ts`):

- `restaurant.{id}.orders`
- `restaurant.{id}.tables`
- `restaurant.{id}.kds.{station}`
- `restaurant.{id}.sessions.{sessionId}` — customer tracking page, one channel per session
- `restaurant.{id}.super.health` — super-admin live metrics

**Publish path**: server-only, via the outbox drainer. Never publish from the browser.

**Subscribe path**: `POST /api/realtime/token` returns an Ably token-request with `capabilities` scoped to what the caller is allowed to see. Dashboard gets `restaurant.{id}.*`; KDS gets `orders` + `kds.*`; customer tracking gets one `sessions.{id}` subscribe-only.

**Fallback**: Ably client auto-downgrades WS → long-polling → SSE.

---

## 11. Payment Architecture

```ts
// packages/shared/src/payments/interface.ts
export interface PaymentGatewayInterface {
  id: 'razorpay' | 'cash';
  createPaymentIntent(input: CreateIntent): Promise<Intent>;
  confirmPayment(intentId: string): Promise<Payment>;
  refund(paymentId: string, amountMinor?: number, reason?: string): Promise<Refund>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
  getSupportedMethods(country: string): Method[];
  getSupportedCurrencies(): string[];
  handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
}
```

- **RazorpayAdapter**: reads the restaurant's `razorpayKeyIdEnc` and `razorpayKeySecretEnc`, decrypts with `ENCRYPTION_KEY` (AES-256-GCM envelope), calls Razorpay. Webhook route is `POST /api/webhooks/razorpay/{restaurantId}` — restaurantId is in the path because every restaurant has its own Razorpay account and thus its own webhook secret.
- **CashAdapter**: no-op `createPaymentIntent` + `confirmPayment` that always succeeds.
- **Order creation flow**:
  1. zod-validate payload.
  2. Open Mongo transaction.
  3. Insert `orders` with `paymentStatus: 'pending'`.
  4. Call `gateway.createPaymentIntent` (idempotent via order's `idempotencyKey`).
  5. Update order with `paymentIntentId`.
  6. Insert outbox `order.created` row.
  7. Commit.
  8. Drainer fans out Ably + webhook + email jobs.
- **PCI scope**: SAQ-A. Card data never hits our servers — Razorpay Checkout hosts the entry fields.

---

## 12. File Uploads

`packages/uploads/src/router.ts` exports one UploadThing `FileRouter`:

| Category | Max | MIME | Auth | Visibility |
|---|---|---|---|---|
| `menuImage` | 5 MB | jpeg/png/webp | flag `menu.edit` | public CDN |
| `restaurantLogo` | 2 MB | jpeg/png/svg | flag `settings.edit_profile` | public CDN |
| `receiptAttachment` | 10 MB | pdf | server-only (worker) | signed URL |
| `dsarExport` | 100 MB | json/zip | server-only | signed URL, 15-min TTL |

Router middleware resolves tenant from session, injects `restaurantId`, rejects without required flag.

---

## 13. Email System

- `packages/email/src/templates/` — each template a React component rendered via `@react-email/render`.
- **Template registry**: order confirmation, order ready, out for delivery, delivered, payment receipt, reservation confirmation/cancellation/reminder, staff invite, daily summary, monthly platform invoice, trial expiry reminders, dunning day 3/8/15, staff login from new device, DSAR export ready.
- **Send path**: handler enqueues a BullMQ `emails` job with template name + props. Worker renders → Resend API → logs delivery. Retries 3 × (30 s / 5 m / 30 m), then dead-letter.
- **Custom sender name**: `from: "${branding.senderName} <orders@mail.menukaze.com>"`. Enterprise plan unlocks a full custom domain via Resend Domains API.
- **Receipt PDFs**: generated in the `receipts` queue via `@react-pdf/renderer`, uploaded via UploadThing, URL referenced in the email body.

---

## 14. Webhook Delivery

Per spec §11.

1. Outbox drainer finds `webhooks` rows matching the event's `restaurantId` + `type`.
2. For each, insert `webhook_deliveries` row (`state: 'pending'`) and enqueue a BullMQ `webhooks` job with the delivery ID.
3. Worker signs: `X-Menukaze-Signature: v1=<hmacSha256(secret, timestamp + '.' + body)>`. Also sends `X-Menukaze-Webhook-Id` (dedup) and `X-Menukaze-Timestamp` (replay protection). POSTs with a 30-s timeout.
4. 2xx → mark delivered. Otherwise append attempt, schedule next at **1 m → 5 m → 30 m → 2 h → 24 h**, update `nextRetryAt`. After 5 failures → permanently failed.
5. IP allowlist: custom HTTPS agent `lookup` rejects non-allowed IPs post-DNS.
6. Replay protection: receivers must verify `X-Menukaze-Timestamp` within 5 min (documented).
7. Dashboard replay clones the delivery with fresh attempts; test button enqueues a synthetic event with `isTest: true`.

---

## 15. Background Jobs

**BullMQ queues**, workers on Fly.io:

| Queue | Trigger | Cadence |
|---|---|---|
| `outbox-drain` | Cron | every 2 s — drains `event_outbox` to Ably + webhooks + emails |
| `webhooks` | Event | on-demand — signing + retry |
| `emails` | Event | on-demand — Resend send |
| `receipts` | Event | on-demand — React-PDF → UploadThing |
| `billing-month-end` | Cron | 1st of month 00:00 UTC — commission invoice |
| `dunning` | Cron | daily 02:00 UTC — day 3/8/15 retries |
| `analytics-rollup` | Cron | hourly — materialise KPIs |
| `retention-purge` | Cron | daily 03:00 UTC — anonymise past `retentionAnonymiseAt` |
| `reservation-reminders` | Cron | every 5 min — reminder offsets |
| `custom-domain-verify` | Cron | every 1 min — poll Vercel SSL status |

**Why Fly.io, not Vercel Cron**: BullMQ expects a persistent `worker.run()` process with in-memory queue state and polling. Vercel Cron is fire-and-forget with a 60-s per-invocation floor. A single 256 MB Fly VM (~$5/mo) is sufficient for launch; scale vertically before horizontally.

---

## 16. Caching Strategy

Upstash Redis keys and TTLs:

| Key | TTL | Invalidated by |
|---|---|---|
| `tenant:slug:{slug}` | 5 min | `restaurant.updated` |
| `tenant:domain:{host}` | 5 min | domain update |
| `menu:{restaurantId}` | 10 min | any `item.*` or `menu.updated` |
| `channels:{restaurantId}` | 60 s | channel CRUD |
| `settings:{restaurantId}` | 5 min | settings write |
| `ratelimit:{apiKeyId}:{window}` | 1 min | sliding |
| `idem:{scope}` | 24 h | — |
| `webhook:dedup:{deliveryId}` | 24 h | — |
| `plan:{planId}` | 1 h | plan edit |
| `platformHealth` | 15 s | — |

Invalidation happens directly from handlers after commit; race is acceptable for the non-critical keys above.

---

## 17. Rate Limiting

`@upstash/ratelimit` sliding-window, keyed by `apiKeyId`. Limits per plan (spec §10):

```
starter 60/min · growth 300/min · enterprise 1000/min · system unlimited
```

Separate `ratelimit:ip:{ip}` floor at 1000/min as a DDoS catch-all. Dashboard tRPC mutations are limited at 600/min per session.

Responses include `Retry-After` when 429.

---

## 18. Idempotency

Middleware on all public-API writes:

1. Read `Idempotency-Key`. Required on `POST /v1/orders` and `POST /v1/payments/intents`.
2. `scope = restaurantId + ':' + apiKeyId + ':' + key`.
3. Lookup `idempotency_records` by `scope`.
4. Same scope + matching `requestHash` → return stored response.
5. Same scope + different hash → 409 `idempotency_conflict`.
6. New scope → reserve row inside the handler's transaction → run handler → store response → return.

TTL index 24 h on `createdAt`.

---

## 19. QR Misuse Prevention (spec §7)

1. QR encodes `https://{slug}.menukaze.com/t/{qrToken}`.
2. `apps/qr-dinein` renders `TableLanding`, requests browser geolocation immediately.
3. Client POSTs `/v1/table-sessions/verify-location` with `{ qrToken, coords?, fingerprint }`. Fingerprint via `@fingerprintjs/fingerprintjs`, hashed server-side.
4. Server checks in order:
   - **Haversine** `coords` ↔ `restaurants.geo`. Beyond `hardening.geofenceRadiusM` → 403.
   - **IP geolocation** (MaxMind GeoLite2). Country mismatch → block.
   - **WiFi gate** (opt-in): client IP must match `restaurants.wifiPublicIps`.
   - **Fingerprint velocity**: Redis sliding window — > 5 sessions / 24 h → 403.
   - **Behavioural anomaly**: post-session checks — < 30 s between orders, > capacity × 2.5 items, off-hours. Flags insert `order_holds` + mark order `status: 'suspicious'`; orders in this state **never reach the KDS** until a manager approves.
5. **First-order delay**: reject `POST /orders` inside `hardening.firstOrderDelayS`.
6. **Max sessions per table**: enforced by counting active `table_sessions`.
7. Manager review UI in dashboard: approve → confirmed + realtime publish; reject → cancelled.

---

## 20. Offline Resilience

Workbox service worker per app:

- **KDS**: `StaleWhileRevalidate` on orders list, `NetworkFirst` on realtime token. IndexedDB queue for status-update mutations. Offline banner after 5 s of Ably disconnection. Reconnect replays the queue with per-mutation `Idempotency-Key`.
- **Kiosk**: precache menu + translations; `CacheFirst` on item images; mutations queued in IDB; "Temporarily Unavailable" message after 5 min offline.
- **QR Dine-In**: precache menu; session state persisted to IDB so closing the tab resumes where the customer left off.
- **Dashboard**: `NetworkOnly` on mutations (fail fast); `StaleWhileRevalidate` on queries with a staleness indicator at > 60 s.

---

## 21. Observability

- **Sentry**: one project per app and the worker. `beforeSend` strips PII (email, phone). Perf 10% sample. Session replay only on dashboard/super-admin, masked.
- **Axiom**: structured JSON via `pino`. Every log has `requestId`, `restaurantId`, `userId?`, `apiKeyId?`.
- **OpenTelemetry**: auto-instrumented HTTP, Mongoose, Redis, BullMQ. Traces to Axiom OTEL endpoint. Custom span makers for tRPC + Hono.
- **Vercel Analytics**: web vitals on storefront + dashboard.
- **Better Uptime**: 1-min pings on every public endpoint, public status page.
- **Correlation**: `requestId` is generated in middleware, propagated through Ably `clientData.requestId` and BullMQ job data so a single request can be traced across HTTP, DB, realtime, and queue.
- **Saved Axiom dashboards**: API error rate per endpoint, P50/P95/P99 latency, webhook delivery success, order funnel, Ably connection health.

---

## 22. Security

- **TLS 1.2+** enforced by Vercel.
- **CSP**: nonce-based, `script-src 'self' 'nonce-{n}' https://js.ably.io https://checkout.razorpay.com`. No `unsafe-inline`.
- **HSTS**: `max-age=63072000; includeSubDomains; preload`.
- **Cookies**: HttpOnly + Secure + SameSite=Lax for sessions; SameSite=Strict for CSRF token.
- **CSRF**: double-submit token on dashboard/super-admin POSTs; `/v1` is CSRF-exempt (API-key auth).
- **CORS**: dashboard same-origin; `/v1` per-key allowlist from `api_keys.corsOrigins`.
- **Secrets**: Vercel env vars for prod/staging; `.env.local` (gitignored) for local dev. Quarterly API-key rotation, annual encryption-key rotation with envelope re-encrypt job.
- **Input validation**: zod at every boundary. Output encoded via React auto-escaping; explicit `DOMPurify` only in receipt previews using `dangerouslySetInnerHTML`.
- **Webhook verification**: `crypto.timingSafeEqual` for every inbound gateway signature.
- **Audit log tamper evidence**: hash chain (`prevHash`) + monotonic `seq`; daily cron verifies the chain and alerts on divergence.
- **Encryption**: Atlas encryption at rest; app-level AES-256-GCM envelope encryption on `razorpayKeySecretEnc` and `webhooks.secret`.
- **Dependency scanning**: `pnpm audit` in CI + Dependabot weekly + Sentry's dependency vulnerability alerts.
- **Secure SDLC**: no direct pushes to `main`; PR + review required; required CI checks on merge.

---

## 23. Compliance & Regulations

Per spec §16. We build compliance at the platform level so individual restaurants benefit automatically.

### 23.1 Data protection & privacy
- **GDPR / UK GDPR** (EU/EEA, UK) — consent-based collection, access/rectification/erasure/portability/objection, data minimisation, lawful-basis documentation, DPIAs for high-risk processing. DPO contact exposed.
- **CCPA / CPRA** (California) — right to know, delete, opt out of sale/sharing, non-discrimination. "Do Not Sell or Share" link on the storefront footer.
- **LGPD** (Brazil), **POPIA** (South Africa), **PDPA** (Singapore, Thailand), **DPDP Act 2023** (India), **PIPEDA** (Canada), **APPs** (Australia), **APPI** (Japan), **PIPA** (South Korea) — all honoured through the same consent, access, deletion, and retention primitives.
- **DSAR** (§25 in spec, Step 39): export (JSON) and delete flows accessible from the restaurant dashboard. Exports stored via UploadThing signed URLs with 15-min TTL.
- **Breach notification**: procedures to notify affected restaurants + customers within GDPR's 72 h and equivalents.

### 23.2 Cross-border data transfer
- **SCCs** for EU/EEA transfers to non-adequate countries.
- **Data residency selection** at onboarding with hosting regions that satisfy local data-localisation mandates.
- **Transfer Impact Assessments** documented where GDPR Chapter V requires.

### 23.3 Marketing & communication
- **CAN-SPAM** (US), **PECR** (UK), **ePrivacy Directive** (EU), **CASL** (Canada), **Spam Act 2003** (Australia) — unsubscribe in every marketing email, sender identification, consent before sending where required, opt-outs honoured within the mandated timeframe.
- **Cookie consent** banner on every customer-facing page with granular categories (strictly necessary, performance, functional, targeting). Consent records stored with timestamps for audit (Step 38).
- **Marketing frequency caps** configurable per restaurant and enforced globally.

### 23.4 Payments & finance
- **PCI DSS SAQ-A**. Card data never stored, processed, or transmitted by Menukaze — delegated entirely to Razorpay (and future certified gateways). Menukaze servers never see PANs.
- **RBI / UPI** (India) — enforced through Razorpay.
- Future: PSD2/SCA (EU), PIX (Brazil), mobile money rules (Africa), PBOC/PCAC (China), MAS/BI/BSP/Bank of Thailand (ASEAN) inherited as those gateways come online.

### 23.5 Tax & invoicing
Fully configurable tax engine. Supports:
- **GST** — India, Australia, New Zealand, Singapore, Canada, Malaysia
- **VAT** — EU, UK, Switzerland, Norway, Turkey, South Africa, UAE, Saudi Arabia, and 160+ other jurisdictions
- **US sales tax** per state/county/city, multi-jurisdiction
- **Consumption tax** — Japan (standard and reduced, dine-in vs takeaway)
- **ICMS / ISS** — Brazil
- **Impuesto al Consumo** — Colombia
- **Custom** — any percent/flat, inclusive/exclusive, per-item/per-order, any name

**E-invoicing mandates** supported: India GST e-invoicing, EU EN 16931, Mexico CFDI, Brazil NF-e, Saudi Arabia ZATCA, Turkey e-Fatura.

**Service charges** are labelled as voluntary in jurisdictions that require it (India CCPA guidelines and equivalents).

### 23.6 Food safety & allergen disclosure
- **EU FIC Regulation 1169/2011** — 14 major allergens tagged on every item
- **FDA Menu Labeling Rule** (US) — calorie + nutrition disclosure for 20+ location chains
- **FSSAI** (India) — licence number on storefront + receipts, veg/non-veg labelling
- **Natasha's Law** (UK) — full ingredient + allergen listing for PPDS items
- **ANVISA** (Brazil), **FSANZ** (AU/NZ), **Japan Food Labeling Act** — allergen + nutrition labelling
- **Dietary tags**: vegetarian, vegan, gluten-free, nut/dairy/soy/egg/shellfish-free, halal, kosher, Jain, sugar-free, organic, locally sourced + custom tags for regional needs.

### 23.7 Accessibility
- **WCAG 2.1 Level AA** foundation across storefront, QR dine-in, kiosk.
- **ADA** (US), **EAA** (EU), **EN 301 549**, **Accessible Canada Act**, **Disability Discrimination Act** (Australia), **RPwD Act 2016** (India), **JIS X 8341-3** (Japan) all satisfied through WCAG compliance.
- Contrast, keyboard navigation, screen reader support, alt text, focus indicators, semantic HTML, high-contrast mode, 44 × 44 px minimum tap targets on kiosk.

### 23.8 Consumer protection
Transparent pricing, honest descriptions, clear refund policies, no dark patterns. Aligned with: Consumer Rights Directive (EU), Consumer Protection Act 2019 (India), ACL (Australia), FTC Act §5 (US), CPA (South Africa), CCR (UK), CDC (Brazil), CPFTA (Singapore), Consumer Contract Act (Japan).

### 23.9 Age verification
For alcohol / tobacco / age-restricted items: per-item or per-category gate with local legal age (21 US, 18 most of EU/UK/India/AU/Brazil, 19 Korea/parts of Canada, 20 Japan/NZ). Methods: self-declaration, date-of-birth entry, third-party integration. Restricted items blocked from cart before verification.

### 23.10 Data retention & deletion
- Configurable retention per restaurant (default: anonymise inactive profiles after 2 years).
- Automated purge jobs on schedule (`retention-purge` cron).
- Customer data export + deletion from the dashboard.
- DPA available for restaurants that require one.

---

## 24. Engineering Practices

Conventions to follow so the codebase stays consistent and reviewable.

### 24.1 Source of truth
- **Schema lock**: every change under `packages/db/src/models/*` requires a migration file in the same PR with rationale in the description.
- **Shared contracts**: every type used across app or package boundaries lives in `packages/shared`. Nothing outside `shared` may be imported by more than one app or package without going through `shared`.
- **Realtime contract**: every Ably channel name flows through `packages/realtime/src/channels.ts` builders. No raw strings elsewhere.

### 24.2 Tenant isolation rules
- Handlers never touch raw Mongoose models. They only touch `ctx.repos.*` from the tenant middleware.
- `Model.withoutTenant(...)` may only appear inside `packages/api/src/routers/platform/*` (super-admin) and `packages/jobs/*` (cron workers). `eslint-plugin-boundaries` rule enforces this.
- Every compound index **must** begin with `restaurantId`. Code review checklist item.

### 24.3 Validation
- zod at every I/O boundary: HTTP request bodies, HTTP query params, tRPC inputs, webhook payloads, BullMQ job data.
- Same zod schemas on both client and server — imported from `packages/shared`.

### 24.4 Transactions & the outbox
- Any multi-write operation that must be atomic goes inside a Mongoose session.
- Any side effect that crosses Mongo's boundary (Ably publish, webhook, email, Resend, UploadThing write) goes through `event_outbox` + drainer. **Never** publish directly from a handler — you lose atomicity.

### 24.5 Idempotency
- Every public write accepts `Idempotency-Key`. The two required endpoints (`POST /v1/orders`, `POST /v1/payments/intents`) **reject** requests that omit it.
- BullMQ jobs are idempotent — jobs re-run on worker restart must produce the same result.

### 24.6 Error envelope
- Every public API error returns `{ error: { code, message, status } }`. Codes come from `packages/shared/src/errors.ts`. No ad-hoc strings.

### 24.7 Logging hygiene
- Never log passwords, card data, full API keys, session tokens, or raw Razorpay secrets. PII (email, phone, full name) is allowed in structured fields only, and Sentry strips them.
- Every log line includes `requestId`. Propagate through async boundaries via context.

### 24.8 Git & review
- Conventional Commits (`feat(dashboard): …`, `fix(storefront-api): …`).
- CI must be green before merge. No `--no-verify`. No force-pushes to main.
- Feature branches named `step-{step-number}-{slug}` (e.g. `step-20-qr-session-start`).

### 24.9 Secrets
- No secret is ever committed. Pre-commit hook via `gitleaks`.
- Local dev uses `.env.local` (gitignored). Reference values live in `.env.example` committed to the repo with keys but no values.
- Rotation schedule documented in `docs/secret-rotation.md`.

### 24.10 Testing discipline
- **Unit** tests live next to the file (`foo.ts` + `foo.test.ts`).
- **Integration** tests live under `packages/<pkg>/test/`.
- **E2E** tests live under `apps/<app>/e2e/`.
- New functionality requires at least unit coverage; new endpoints require at least one Playwright scenario.
- Snapshot tests only for stable visual output (React Email templates).

### 24.11 Accessibility & i18n
- Every customer-facing component passes axe-core in Playwright.
- Every user-visible string goes through `next-intl` — no hardcoded English in JSX.
- RTL layout verified in the Arabic locale test fixture.

### 24.12 Performance budgets
- Storefront LCP ≤ 2.5 s on mid-tier Android (Lighthouse CI).
- Dashboard tRPC P95 ≤ 300 ms.
- KDS realtime delivery P95 ≤ 2 s (Ably publish → browser render).
- Public API P95 ≤ 500 ms.

---

## 25. Environment Configuration

Three environments plus an in-prod sandbox DB.

- **development** — local, Docker Compose for Mongo + Redis.
- **staging** — Vercel Preview + Atlas `menukaze_staging` database.
- **production** — Vercel Prod + Atlas `menukaze_live` database.
- **sandbox** — NOT a separate environment. A parallel database `menukaze_sandbox` inside production Atlas, selected at runtime by the API-key prefix.

**Env var catalogue (abridged)**:

```
MONGODB_URI
MONGODB_DB_LIVE
MONGODB_DB_SANDBOX
BETTER_AUTH_SECRET
BETTER_AUTH_URL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
ABLY_API_KEY
RESEND_API_KEY
RESEND_FROM_DOMAIN
UPLOADTHING_SECRET
UPLOADTHING_APP_ID
RAZORPAY_WEBHOOK_SECRET
ENCRYPTION_KEY                # 32-byte base64, envelope encryption
SENTRY_DSN
AXIOM_DATASET
AXIOM_TOKEN
VERCEL_TOKEN
FLY_API_TOKEN
MAXMIND_LICENSE_KEY
NEXT_PUBLIC_ABLY_CLIENT_ID_SALT
```

---

## 26. CI/CD

`.github/workflows/ci.yml`:

```
on: [pull_request, push: [main]]
jobs:
  install    — pnpm install with Turbo cache
  lint       — turbo run lint --filter=...[origin/main]
  typecheck  — tsc --noEmit
  test       — turbo run test
  build      — turbo run build
  e2e        — Playwright (only if apps/* changed)
  preview    — Vercel CLI per app (PR only)
```

`.github/workflows/release.yml` on push to `main`: runs CI + `vercel --prod` per app + `flyctl deploy` for the worker + `pnpm migrate:up`.

**Migrations**: `migrate-mongo`. Each migration runs inside a session where possible. Rule: **Mongoose models describe current shape; migrations apply structural changes and backfills.** Run before traffic switch on each release. Zero-downtime via the N / N+1 / N+2 additive-then-drop pattern.

---

## 27. Build Itinerary — From Empty Folder to Production

The concrete, end-to-end build plan. Phases are sequential — do not start phase N+1 until phase N passes its verification. Inside a phase, steps are also sequential unless marked "(parallel)". Every step ends with a verification you can run in under two minutes.

### Phase 0 — Accounts & Local Toolchain (≈1 hour)

**Create accounts** on each free tier (see §3.1 for limits):

1. **GitHub** — create empty repo `menukaze` (private).
2. **MongoDB Atlas** — sign up → create free `M0` cluster in the region closest to you → create a database user → whitelist `0.0.0.0/0` temporarily → copy the connection string.
3. **Upstash** — sign up → create a Redis database (global, TLS on) → copy both the REST URL/token and the TCP endpoint URL.
4. **Vercel** — sign up with the GitHub account → no projects yet.
5. **Fly.io** — sign up → install `flyctl` → `flyctl auth login`.
6. **Ably** — sign up → create an app `menukaze-dev` → copy the API key.
7. **Resend** — sign up → verify a sending domain (`mail.menukaze.com`) later; for now use the sandbox domain `onboarding@resend.dev`.
8. **UploadThing** — sign up → create an app → copy `UPLOADTHING_SECRET` and `UPLOADTHING_APP_ID`.
9. **Razorpay** — sign up → stay in **Test Mode** → copy the test key ID and secret.
10. **Sentry** — sign up → create one project per app slug (`storefront`, `dashboard`, `qr-dinein`, `kiosk`, `super-admin`, `worker`).
11. **Axiom** — sign up → create dataset `menukaze` → copy ingest token.
12. **MaxMind** — sign up (free) → generate a license key for GeoLite2.
13. **Better Uptime** — sign up → no monitors yet.

**Install local toolchain**:
```
node -v     # must be >= 22 (prod target is 22 LTS; local dev on Node 24+ is fine)
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v     # must be 10.x
docker -v   # any recent version
```

Production is pinned to **Node 22 LTS** via `engines.node` in the root `package.json` and a `.nvmrc` file at the repo root — Vercel and Fly.io read both and install Node 22 at build time regardless of the local dev Node version. Local dev can run any Node ≥ 22. The `.npmrc` sets `engine-strict=false` so a Node 24 local does not hard-fail `pnpm install`.

**Verification**: every account dashboard loads; `node`, `pnpm`, `docker` all report versions.

---

### Phase 1 — Repo Initialisation (≈2 hours)

**Goal**: an empty Turborepo with the folder structure from §4, tooling configured, and a green CI pipeline.

1. **Clone the empty repo**
   ```
   git clone git@github.com:<you>/menukaze.git
   cd menukaze
   ```

2. **Create `package.json`** at the root with `"private": true`, pin `pnpm@10`, declare `engines.node: "22.x"`. Also create `.nvmrc` containing `22` and `.npmrc` containing `engine-strict=false` (so local Node 24+ does not hard-fail `pnpm install`).

3. **Create `pnpm-workspace.yaml`**:
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
     - "tooling/*"
   ```

4. **Install Turborepo**:
   ```
   pnpm add -Dw turbo typescript prettier
   ```

5. **Scaffold `turbo.json`** with pipelines: `build`, `lint`, `typecheck`, `test`, `dev`.

6. **Scaffold `tooling/`** (four internal packages — tsconfig, eslint-config, vitest-config, playwright-config) and pin their `package.json` names (`@menukaze/tsconfig`, etc.) so workspace imports resolve.

7. **Create base tsconfigs**: one in `tooling/tsconfig/base.json` (strict, Node16 moduleResolution), one for Next.js apps, one for Node packages, one for React packages. Every `apps/*` and `packages/*` extends one of them.

8. **Create base ESLint config** in `tooling/eslint-config/`:
   - `@typescript-eslint/*` rules
   - `eslint-config-next` for apps
   - `eslint-plugin-boundaries` with the monorepo import rules from §4
   - `eslint-plugin-unicorn` (sanity rules)

9. **Create base Prettier config** in `tooling/prettier-config/` with `prettier-plugin-tailwindcss`.

10. **Git hooks**: `pnpm add -Dw husky lint-staged` → `pnpm exec husky init` → configure `lint-staged` to run `prettier --write` + `eslint --fix` on staged files.

11. **Secret scanning**: install `gitleaks` locally + add `.gitleaks.toml` + pre-commit hook.

12. **Create `.gitignore`** covering `node_modules`, `.next`, `.turbo`, `.env.local`, `dist`, `coverage`, `playwright-report`, `.vercel`, `.flyctl`, `*.log`.

13. **Create `.env.example`** at the root listing every env var from §25 with placeholder values. Commit it — actual `.env.local` stays gitignored.

14. **First commit**: `feat: bootstrap monorepo`.

15. **Set up GitHub Actions**: create `.github/workflows/ci.yml` per §26. Push. Confirm it runs green (will be empty but should not error).

**Verification**:
```
pnpm install
pnpm lint       # no files to lint yet, exits 0
pnpm typecheck  # no files to typecheck yet, exits 0
git push
```
GitHub Actions: green checkmark.

---

### Phase 2 — Foundation Packages (≈1 day)

**Goal**: every shared package exists, types export correctly, and unit tests pass against `mongodb-memory-server`. At the end of this phase you can create a restaurant tenant, resolve it via middleware, and write a tenant-scoped Mongoose query.

Build in this order (dependencies flow strictly downward):

1. **`packages/shared`** (leaf, no internal deps)
   - `src/schemas/` — zod schemas for `Restaurant`, `Menu`, `Item`, `Order`, `TableSession`, `Customer`, etc.
   - `src/types/` — exported TS types inferred from the schemas
   - `src/errors.ts` — the error code registry
   - `src/currency.ts` — locale formatting helpers
   - `src/payments/interface.ts` — `PaymentGatewayInterface`
   - Test: `vitest run` — schemas parse valid examples, reject invalid.

2. **`packages/db`** (leaf-ish, imports `shared`)
   - `src/client.ts` — `getMongoClient(dbContext)` returning a pooled `mongoose.Connection` for `menukaze_live` or `menukaze_sandbox`.
   - `src/plugins/tenantScoped.ts` — the pre-hook plugin from §5.1.
   - `src/models/*.ts` — Mongoose schemas for every collection in §5.4. Each attaches `tenantScopedPlugin`.
   - `src/repos/createTenantRepo.ts` — the repo wrapper.
   - `src/seed.ts` — creates a demo tenant with a menu, 10 tables, one sample order.
   - `migrations/` — `migrate-mongo` config + `00001-initial-indexes.ts`.
   - Test: spin up `mongodb-memory-server` replset, assert tenant plugin throws without `restaurantId`, assert seed runs.

3. **`packages/tenant`**
   - `src/context.ts` — types for `ctx.tenant`.
   - `src/middleware/next.ts` — Next.js `middleware.ts` helper: reads `host`, resolves tenant, injects headers.
   - `src/middleware/trpc.ts` — tRPC middleware that pulls the headers + constructs `ctx.repos`.
   - `src/middleware/hono.ts` — Hono middleware doing the same for `/v1`.
   - Test: mock host → assert `ctx.tenant.id` is set.

4. **`packages/ui`** — shadcn init
   - `pnpm dlx shadcn@latest init --cwd packages/ui`
   - Pick: default style, slate base colour, CSS variables, `@menukaze/ui` as the alias.
   - Add the first batch: `button`, `input`, `label`, `form`, `dialog`, `dropdown-menu`, `select`, `table`, `toast`, `tabs`, `sheet`, `command`, `popover`, `tooltip`, `calendar`, `separator`, `skeleton`, `badge`, `card`.
   - Create `tailwind.preset.ts` with brand colours.
   - Export everything from `src/index.ts`.
   - Test: import `<Button />` in a smoke test, assert it renders.

5. **`packages/realtime`**
   - `src/channels.ts` — channel name builders from §10.
   - `src/publish.ts` — server-side publisher using the Ably SDK.
   - `src/token.ts` — the token-request endpoint handler.
   - Test: builder produces expected strings.

6. **`packages/auth`**
   - BetterAuth config with MongoDB adapter pointing at `getMongoClient('live')`.
   - Email/password, email verification, password reset.
   - Session helpers: `getSession(request)`, `requireSession(request)`.
   - Test: signup → verify → login flow against mm-server.

7. **`packages/rbac`**
   - `src/flags.ts` — permission flag registry.
   - `src/roleFlags.ts` — base flag set per predefined role.
   - `src/resolve.ts` — `resolveFlags(membership)`.
   - `src/middleware.ts` — `requirePermission(...flags)` for tRPC + Hono.
   - Test: Waiter role resolves to the right flag set; Custom role merges.

8. **`docker-compose.yml`** at the repo root (Mongo replset + Redis). Add `pnpm services:up` script.

9. **Seed script** at `scripts/seed.ts` — boots mongo via `docker compose`, runs `packages/db` seed.

**Verification checklist**:
```
docker compose up -d mongo redis
pnpm db:seed
pnpm test --filter=./packages/*
```
All green.

---

### Phase 3 — Scaffold Apps (≈2 hours)

**Goal**: all 5 Next.js apps and 1 worker exist, boot locally, and render a "hello tenant" page that proves the tenant middleware works.

1. **`apps/storefront`** (parallel)
   ```
   pnpm create next-app@latest apps/storefront --typescript --tailwind --app --src-dir --import-alias "@/*"
   ```
   - Add workspace deps: `@menukaze/ui`, `@menukaze/shared`, `@menukaze/tenant`, `@menukaze/db`, `@menukaze/realtime`.
   - Copy `tailwind.config.ts` to use `@menukaze/ui/tailwind.preset`.
   - Add root `middleware.ts` calling `@menukaze/tenant/middleware/next`.
   - Add `app/page.tsx` that reads `ctx.tenant` and renders the name.

2. **`apps/dashboard`** — same scaffold, path `/admin`.

3. **`apps/qr-dinein`** — same scaffold, path `/t/[qrToken]`.

4. **`apps/kiosk`** — same scaffold, path `/kiosk`.

5. **`apps/super-admin`** — same scaffold, but no tenant middleware — uses `super_admins` collection check.

6. **`apps/worker`** — plain Node service:
   - `src/index.ts` — BullMQ workers + `node-cron` scheduler.
   - `src/processors/outbox.ts` — outbox drainer (empty for now).
   - `Dockerfile` for Fly.io deploy.
   - `fly.toml` with `auto_stop_machines = false`.

7. **Update `turbo.json`** so `turbo run dev` spawns every app in parallel.

8. **Update `/etc/hosts`**:
   ```
   127.0.0.1  demo.localhost.menukaze.dev
   127.0.0.1  admin.localhost.menukaze.dev
   ```

**Verification**:
```
pnpm dev
```
- `http://demo.localhost.menukaze.dev:3001` → storefront shows "Demo Restaurant"
- `http://demo.localhost.menukaze.dev:3000/admin` → dashboard shows "Demo Restaurant (admin)"
- `http://admin.localhost.menukaze.dev:3004` → super-admin loads
- Worker logs "worker ready"

Commit: `feat: scaffold all apps`.

---

### Phase 4 — MVP Build (Steps 1–23) (bulk of the work)

Follow the numbered steps in **product doc §20** in order. For each step:

1. Create a branch: `git checkout -b step-<N>-<slug>`
2. Implement the step end-to-end (backend + frontend + test).
3. Run the verification test described at the end of the step description in §20.
4. Run the local gate:
   ```
   pnpm lint
   pnpm typecheck
   pnpm test --filter=...[HEAD]
   pnpm build
   ```
5. Commit: `feat(<pkg>): step N — <title>`.
6. Open PR → CI must be green → merge → delete branch.
7. Mark the step done in a running `docs/progress.md` checklist.

**Milestone checkpoints during MVP** (run after the specified steps, per product doc §20):
- After Step 13 → **C1** (first end-to-end order)
- After Step 14 → **C2** (live KDS flow)
- After Step 22 → **C3** (complete QR dine-in session)

**If a checkpoint fails, stop.** Do not continue adding steps on top of a broken contract — fix the integration first.

**Steps in MVP scope**: 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23 (see product doc §20 for the full descriptions).

**Verification at end of Phase 4**: on local dev,
1. Sign up via `demo.localhost.menukaze.dev/signup`
2. Complete onboarding wizard
3. Visit the storefront, place a test order via Razorpay test mode
4. Order appears in the dashboard + KDS
5. Mark it Ready → customer tracking page updates live
6. Scan a table QR, start a session, place two rounds, request the bill, pay → table releases
7. Order confirmation + receipt emails arrive via Resend test domain

---

### Phase 5 — Pre-Launch Review (≈1 day)

Before shipping production, a gate that catches the things production exposes.

1. **Security checklist**:
   - CSP headers applied and nonce-based (§22).
   - All secrets loaded from env, none in source.
   - `gitleaks` clean on the full history.
   - Webhook HMAC verification tested with a crafted bad signature (must reject).
   - Audit log hash chain verifier runs clean.
   - `pnpm audit --audit-level=high` → zero critical.
   - Razorpay webhook test with mismatched signature → rejected.

2. **Compliance checklist** (§23):
   - Cookie consent banner present, strictly-necessary-only blocks analytics.
   - Privacy policy page published (static).
   - Terms of service page published (static).
   - DSAR export returns a valid JSON bundle for a test customer.
   - Receipt PDF for every tax jurisdiction you will launch in passes a manual field-check.
   - Allergen tagging visible on storefront + KDS + receipt.

3. **Performance budget check**:
   - `pnpm build` every app → bundle sizes sane.
   - Storefront Lighthouse (mobile) → LCP ≤ 2.5 s, TBT ≤ 200 ms.
   - Dashboard tRPC smoke test → P95 ≤ 300 ms.
   - KDS realtime end-to-end measured via `performance.now()` logging → P95 ≤ 2 s.

4. **Backup & restore drill**:
   - Take an Atlas snapshot of the staging DB.
   - Restore to a scratch cluster.
   - Confirm one tenant's data loads.

5. **Observability dry-run**:
   - Force an error on staging → confirm it reaches Sentry.
   - Send a log line → confirm it reaches Axiom.
   - Run a trace → confirm it appears in Axiom OTEL.
   - Trigger a webhook failure → confirm the delivery log records the attempt.

6. **Load smoke** (not real load testing — just "nothing obviously breaks"):
   - `k6 run scripts/smoke.js` — 50 concurrent virtual users placing an order over 60 s. Target: 0 errors, P95 < 1 s.

**Verification**: every box ticked on `docs/pre-launch-checklist.md`.

---

### Phase 6 — Production Deployment (≈half day)

**Goal**: `menukaze.com` is live, a real restaurant can sign up, and the full stack is healthy.

1. **Provision production infra** (reuse Phase 0 accounts, create prod resources):
   - MongoDB Atlas → upgrade free M0 to a paid M10 (or stay on M0 if you're comfortable) → enable PITR backups → create dedicated user `menukaze-prod` → set IP allowlist to Vercel + Fly egress ranges (or `0.0.0.0/0` behind auth).
   - Upstash → create a **separate** production Redis database in the same region as MongoDB.
   - Ably → create a second app `menukaze-prod` (sandbox app stays as `menukaze-dev`).
   - Resend → verify a real domain (`mail.menukaze.com`), add SPF/DKIM/DMARC DNS.
   - Sentry → same projects (they support environment tags) or create a separate `menukaze-prod` org.
   - Axiom → create a `menukaze_prod` dataset.

2. **DNS**:
   - Point `menukaze.com` apex at Vercel.
   - Add wildcard `*.menukaze.com` CNAME → Vercel.
   - Add `admin.menukaze.com` → Vercel.
   - Add `api.menukaze.com` → Vercel (rewrite in `vercel.json`).
   - Add `sandbox-api.menukaze.com` → Vercel.
   - Add `mail.menukaze.com` MX + SPF + DKIM + DMARC records from Resend.

3. **Vercel projects** — create one per app:
   - Import the GitHub repo for each of: `storefront`, `dashboard`, `qr-dinein`, `kiosk`, `super-admin`.
   - Set the root directory to `apps/<name>`.
   - Set the install command to `pnpm install --frozen-lockfile`.
   - Set the build command to `turbo run build --filter=<app>`.
   - Attach custom domains.
   - Paste the full env var catalogue (§25) into each project's production environment. Mark `NEXT_PUBLIC_*` as exposed.
   - Paste a staging env into the Preview environment.

4. **Fly.io worker**:
   ```
   cd apps/worker
   flyctl launch --no-deploy
   flyctl secrets set $(cat .env.prod | xargs)
   flyctl deploy
   flyctl scale memory 256
   flyctl scale count 1
   ```
   Confirm `flyctl logs` shows "worker ready" + outbox drainer polling.

5. **Run production migrations**:
   ```
   MONGODB_URI=<prod> pnpm migrate:up
   ```

6. **Seed the built-in plans** (Starter, Growth, Enterprise) via a one-shot script.

7. **Create the first super-admin**: manually insert into `super_admins` with your userId.

8. **Smoke test on production** (real domain, real Razorpay test mode):
   - Sign up a test merchant at `menukaze.com`.
   - Complete onboarding.
   - Open `theirslug.menukaze.com` in incognito.
   - Place a test order with a Razorpay test card.
   - Watch it flow into the dashboard + KDS.
   - Mark it Ready → tracking page updates.
   - Scan a table QR → complete a dine-in session.
   - Receive every email.
   - Delete the test merchant.

9. **Enable monitoring**:
   - Better Uptime monitors for `menukaze.com`, `api.menukaze.com`, `admin.menukaze.com`, one tenant subdomain, and the worker health endpoint.
   - Sentry alerts: error rate spikes, new issue types, unresolved > 1 h.
   - Axiom alerts: webhook delivery failure rate > 5 %, API P95 > 1 s sustained 5 min.
   - Publish the Better Uptime status page at `status.menukaze.com`.

**Verification**: end-to-end smoke test passes on the live domain. Status page green. First real restaurant can sign up.

Tag the release: `git tag v1.0-mvp && git push --tags`.

---

### Phase 7 — Post-MVP Build (Steps 24–54)

Continue through **product doc §20** one step at a time. Exact same loop as Phase 4 (branch → implement → verify → local gate → PR → merge). Run the remaining milestone checkpoints at their trigger points:

- **C4** after Step 19 — Walk-in + KDS
- **C5** after Steps 28 + 30 — Channel attribution
- **C6** after Steps 35 + 37 — CDP merging
- **C7** after Steps 28 + 33 — Webhook delivery
- **C8** after Steps 41 + 42 + 46 — Super admin live
- **C9** after Steps 25 + 17 — Reservation round-trip
- **C10** after Steps 38 + 39 + 40 — Compliance gates

Each merged step auto-deploys via GitHub Actions → Vercel Preview → Vercel Prod on main.

Scoped feature flags (Step 47) gate risky steps behind per-tenant rollouts.

---

### Phase 8 — Ongoing Operations

Once in production, these run forever — set them up now so they exist when you need them.

1. **Backups**:
   - Atlas continuous backup is automatic.
   - Weekly manual restore drill to a scratch cluster (30 min once a month).
   - Quarterly full disaster-recovery drill — restore everything from snapshot + replay outbox.

2. **Incident response**:
   - `docs/incident-runbook.md` with: how to disable a broken webhook, how to revoke a compromised API key, how to suspend a tenant, how to roll back a release, how to put the platform in read-only mode.
   - Status page post template.
   - Rollback: `git revert` + push; Vercel redeploys; `flyctl releases rollback` for worker.

3. **Secret rotation**:
   - Quarterly: rotate Razorpay platform webhook secret, Ably keys, Upstash tokens, Resend key, UploadThing secret, Sentry DSN. Each rotation has a dedicated checklist file.
   - Annually: rotate `ENCRYPTION_KEY` — re-encrypt per-tenant Razorpay secrets via the envelope re-encrypt job.

4. **Dependency updates**:
   - Dependabot weekly PRs auto-merged for patch versions on green CI.
   - Minor upgrades batched monthly.
   - Major upgrades quarterly with a manual test plan.

5. **Cost monitoring**:
   - Monthly review of each service's dashboard vs the free-tier limits in §3.1.
   - Upgrade a service only when its trigger threshold is crossed.

6. **Compliance reviews**:
   - Quarterly DSAR test: submit a test export + delete request, verify the data is correct and the delete is complete.
   - Annual review of every regulation in §23 for scope changes.
   - Audit log hash-chain verifier runs daily via `retention-purge` cron; alerts if broken.

**Verification — always green**: the platform should have a green dashboard, working backups, a runnable rollback, and a current cost under the §3.1 budget at all times.

---

