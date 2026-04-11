# Menukaze worker — Fly.io deployment image
# Phase 3: minimal Dockerfile that runs the tsx-watched index.
# Phase 6 (production deploy): switch to a multi-stage build with esbuild
# bundling for faster cold starts.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY tooling tooling
COPY packages packages
COPY apps/worker apps/worker

RUN pnpm install --frozen-lockfile --filter @menukaze/worker...

# Strip dev deps for the runtime image
ENV NODE_ENV=production
EXPOSE 8080

CMD ["pnpm", "--filter", "@menukaze/worker", "start"]
