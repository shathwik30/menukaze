# Repository Guidelines

## Project Structure & Module Organization
`apps/` contains the runnable products: `dashboard`, `storefront`, `qr-dinein`, `kiosk`, `super-admin`, and the `worker`. Shared domain code lives in `packages/` (`db`, `auth`, `tenant`, `shared`, `rbac`, `realtime`, `ui`). Reusable repo-wide configs live in `tooling/` (`tsconfig`, `eslint-config`, `vitest-config`, `playwright-config`, `prettier-config`). Product and engineering specs live in `docs/`.

## Build, Test, and Development Commands
Use Node `22.x` and pnpm `10.x`.

- `nvm use 22` switches to the supported runtime.
- `pnpm db:seed` loads the demo tenant (`demo`) and baseline data.
- `pnpm dev` runs all apps in parallel through Turborepo.
- `pnpm build` runs the full production build across workspaces.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` run the core quality gates.
- `pnpm test:e2e` runs Playwright smoke coverage. Prefer running it under Node 22.

## Coding Style & Naming Conventions
TypeScript is the default. Use 2-space indentation, semicolons, single quotes, and kebab-case filenames. Keep React components and server actions focused; prefer shared logic in `packages/` over app-local duplication. Formatting is enforced by Prettier via `@menukaze/prettier-config`; linting is enforced by ESLint flat config from `tooling/eslint-config`.

## Testing Guidelines
Unit tests use Vitest and should live beside source as `*.test.ts` or `*.test.tsx`. E2E tests live under `apps/<app>/e2e/` as `*.spec.ts`. New business logic should ship with unit coverage; new user-facing routes or flows should add at least one Playwright scenario. Before opening a PR, run `pnpm lint && pnpm typecheck && pnpm test`.

## Commit & Pull Request Guidelines
Follow the existing Conventional Commit style from history: `feat: ...`, `feat(scope): ...`, `chore(audit): ...`. Keep messages specific to the shipped slice, for example `feat: phase 4 step 21 multi-round ordering`. PRs should include a concise summary, linked issue or phase/step reference, test evidence, and screenshots or recordings for UI changes.

## Security & Configuration Tips
Copy `.env.example` to `.env.local`; never commit secrets. Keep `.env.local`, `.vercel`, and generated test artifacts untracked. Use seeded/demo credentials and local services for development instead of production keys.
