# Menukaze worker Fly.io deployment image.
# Keep the runtime image small and deterministic for production deploys.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Copy workspace manifests first for layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY tooling tooling
COPY packages packages
COPY apps/worker apps/worker

RUN pnpm install --frozen-lockfile --filter @menukaze/worker...

# Strip dev deps for the runtime image.
ENV NODE_ENV=production
EXPOSE 8080

CMD ["pnpm", "--filter", "@menukaze/worker", "start"]
