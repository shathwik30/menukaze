import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed source-direct (TypeScript), so Next must
  // transpile them as part of its build.
  transpilePackages: [
    '@menukaze/db',
    '@menukaze/realtime',
    '@menukaze/shared',
    '@menukaze/tenant',
    '@menukaze/ui',
  ],
  // Mongoose needs the Node runtime, not Edge — exclude from server bundling.
  serverExternalPackages: ['mongoose'],
};

export default config;
